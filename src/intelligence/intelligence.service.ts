import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Prediction } from '../entities/prediction.entity';
import { Device } from '../entities/device.entity';
import { Sensor } from '../entities/sensor.entity';
import { DecisionAction } from '../entities/decision-action.entity';
import { MlEventActiveView } from '../entities/views';
import {
  IntelligencePredictionDto,
  IntelligenceWarningDto,
  IntelligenceHealthDto,
  IntelligenceHealthSummaryDto,
  IntelligenceSensorHealthDto,
  IntelligenceHealthStatus,
  IntelligenceSeverity,
} from './intelligence.dto';
import {
  DecisionActionDto,
  DecisionActionListResponseDto,
} from './decision-action.dto';

function toIsoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function formatIso(d: Date | null | undefined): string {
  return d ? d.toISOString() : new Date(0).toISOString();
}

function mapEventTypeToSeverity(eventType: string | null): IntelligenceSeverity {
  const t = String(eventType || '').toLowerCase();
  if (t === 'critical') return 'critical';
  if (t === 'warning') return 'warning';
  return 'info';
}

function normalizePredictionSeverity(args: {
  severityRaw: string | null | undefined;
  isAnomaly: boolean;
  anomalyScore: number | null;
  riskLevel: string | null | undefined;
}): IntelligenceSeverity {
  const sevLower = String(args.severityRaw ?? 'info').toLowerCase();
  const base: IntelligenceSeverity =
    sevLower === 'critical' || sevLower === 'warning' ? (sevLower as any) : 'info';

  const risk = String(args.riskLevel ?? 'NONE').toUpperCase().trim();
  const anomalyScore = args.anomalyScore ?? 0;
  const hasAnomalySignal = Boolean(args.isAnomaly) || anomalyScore > 0;

  if (base === 'critical' && !hasAnomalySignal && risk === 'NONE') {
    return 'warning';
  }

  return base;
}

@Injectable()
export class IntelligenceService {
  constructor(
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
    @InjectRepository(MlEventActiveView)
    private readonly mlEventsRepo: Repository<MlEventActiveView>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(DecisionAction)
    private readonly decisionRepo: Repository<DecisionAction>,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /intelligence/predictions
  // ---------------------------------------------------------------------------
  async listPredictions(limit = 50): Promise<IntelligencePredictionDto[]> {
    const rows = await this.predictionRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.sensor', 'sensor')
      .leftJoinAndSelect('p.device', 'device')
      .orderBy('p.targetTimestamp', 'ASC')
      .limit(limit)
      .getMany();

    return rows.map((p) => {
      const dto = new IntelligencePredictionDto();
      dto.sensorId = p.sensor ? String(p.sensor.id) : '';
      dto.sensorName = p.sensor?.name ?? 'Sensor';
      dto.deviceId = p.device ? String(p.device.id) : '';
      dto.deviceName = p.device?.name ?? 'Dispositivo';

      dto.predictedValue = Number(p.predictedValue);
      dto.unit = p.sensor?.unit ?? null;
      dto.horizonMinutes = p.horizonMinutes ?? 10;
      dto.trend = (p.trend as string) ?? 'stable';
      dto.riskLevel = (p.riskLevel as string | null) ?? 'NONE';
      dto.isAnomaly = Boolean(p.isAnomaly && Number(p.isAnomaly) !== 0);
      dto.anomalyScore = p.anomalyScore !== null && p.anomalyScore !== undefined ? Number(p.anomalyScore) : null;
      dto.severity = normalizePredictionSeverity({
        severityRaw: (p.severity as string | null) ?? 'info',
        isAnomaly: dto.isAnomaly,
        anomalyScore: dto.anomalyScore,
        riskLevel: dto.riskLevel,
      });
      dto.status = (p.status as string | null) ?? 'active';

      const explanationRaw = p.explanation ?? '';

      // Extraer solo texto y acción recomendada desde explanation (JSON o texto plano),
      // sin recalcular severidad ni riesgo.
      let explanationText = explanationRaw;
      let recommended = 'Sin acción específica, continuar monitoreo.';

      try {
        const parsed = typeof explanationRaw === 'string' ? JSON.parse(explanationRaw) : explanationRaw;
        if (parsed && typeof parsed === 'object') {
          if ('explanation' in parsed) {
            explanationText = String((parsed as any)['explanation'] ?? explanationRaw);
          }
          if ('recommended_action' in parsed) {
            const ra = String((parsed as any)['recommended_action'] ?? '');
            if (ra.trim().length > 0) {
              recommended = ra;
            }
          }
        }
      } catch {
        // No es JSON: usamos el texto tal cual y dejamos recommended por defecto.
        explanationText = explanationRaw;
      }

      dto.explanation = explanationText || explanationRaw;
      dto.recommendedAction = recommended;

      dto.targetTimestamp = formatIso(p.targetTimestamp ?? null);
      return dto;
    });
  }

  // ---------------------------------------------------------------------------
  // GET /intelligence/warnings
  // ---------------------------------------------------------------------------
  async listWarnings(limit = 50): Promise<IntelligenceWarningDto[]> {
    const rows = await this.mlEventsRepo
      .createQueryBuilder('e')
      .orderBy('e.createdAt', 'DESC')
      .limit(limit)
      .getMany();

    return rows.map((e) => {
      const dto = new IntelligenceWarningDto();
      dto.eventId = String(e.eventId);
      dto.deviceId = String(e.deviceId);
      dto.deviceName = e.deviceName ?? 'Dispositivo';
      dto.sensorId = e.sensorId ? String(e.sensorId) : null;
      dto.sensorName = e.sensorName ?? null;

      dto.severity = mapEventTypeToSeverity(e.eventType as string);
      dto.status = (e.status as any) ?? 'active';

      dto.title = e.title ?? 'Evento ML';

      // description amigable: usar message o un resumen corto.
      dto.description = e.message ?? 'Evento generado por el motor de ML.';

      // Extraer recommended_action del payload si existe.
      let recommended = 'Sin acción específica, continuar monitoreo.';
      try {
        if (e.payload) {
          const parsed = JSON.parse(String(e.payload));
          if (parsed && typeof parsed === 'object' && 'recommended_action' in parsed) {
            recommended = String(parsed['recommended_action']);
          }
        }
      } catch {
        // si falla el JSON, dejamos el valor por defecto
      }

      dto.recommendedAction = recommended;
      dto.occurredAt = formatIso(e.createdAt ?? null);

      return dto;
    });
  }

  // ---------------------------------------------------------------------------
  // GET /intelligence/health
  // ---------------------------------------------------------------------------
  async getHealth(): Promise<IntelligenceHealthDto> {
    // Resumen muy simple basado en timestamps y conteos.
    const [predCount, modelAgg, events] = await Promise.all([
      this.predictionRepo.count(),
      this.predictionRepo
        .createQueryBuilder('p')
        .select('COUNT(DISTINCT p.modelId)', 'models')
        .addSelect('COUNT(DISTINCT p.sensorId)', 'sensors')
        .getRawOne(),
      this.mlEventsRepo
        .createQueryBuilder('e')
        .orderBy('e.createdAt', 'DESC')
        .limit(100)
        .getMany(),
    ]);

    const now = new Date();
    const lastEventAt = events[0]?.createdAt ?? null;
    const minutesSinceLastEvent = lastEventAt
      ? (now.getTime() - lastEventAt.getTime()) / 60000
      : Infinity;

    let status: IntelligenceHealthStatus = 'ok';
    let title = 'Motor de ML operativo';
    let description = 'Se están generando predicciones y eventos ML de forma reciente.';
    let suggestion = 'Continuar monitoreando el estado de ML.';

    if (!predCount) {
      status = 'down';
      title = 'ML sin predicciones';
      description = 'No se han generado predicciones en la base de datos.';
      suggestion = 'Verificar que el batch runner de ML esté en ejecución.';
    } else if (minutesSinceLastEvent > 30 && minutesSinceLastEvent < Infinity) {
      status = 'degraded';
      title = 'ML con actividad reducida';
      description = 'Hace más de 30 minutos que no se registran nuevos eventos de ML.';
      suggestion = 'Verificar carga de datos y estado del runner.';
    }

    const summary = new IntelligenceHealthSummaryDto();
    summary.status = status;
    summary.title = title;
    summary.description = description;
    summary.suggestion = suggestion;
    summary.lastBatchRunAt = toIsoOrNull(lastEventAt);
    summary.maxIngestionLagMinutes = Math.round(minutesSinceLastEvent === Infinity ? 0 : minutesSinceLastEvent);
    summary.activeModels = Number(modelAgg?.models ?? 0);
    summary.staleModels = 0; // se puede mejorar con lógica de "aged" models
    summary.monitoredSensors = Number(modelAgg?.sensors ?? 0);

    // Salud por sensor: de momento, utilizamos los últimos predictions y ml_events
    const latestPerSensor = await this.predictionRepo
      .createQueryBuilder('p')
      .leftJoin('p.sensor', 'sensor')
      .select('sensor.id', 'sensorId')
      .addSelect('MAX(p.predictedAt)', 'lastPredictionAt')
      .groupBy('sensor.id')
      .getRawMany();

    const healthBySensor: IntelligenceSensorHealthDto[] = [];

    for (const row of latestPerSensor) {
      const sensorId = String(row.sensorId);
      const sensor = await this.sensorRepo.findOne({ where: { id: sensorId }, relations: ['device'] });
      if (!sensor) continue;

      const device = sensor.device;

      const s = new IntelligenceSensorHealthDto();
      s.sensorId = sensorId;
      s.sensorName = sensor.name;
      s.deviceName = device?.name ?? 'Dispositivo';

      const lastPred = row.lastPredictionAt ? new Date(row.lastPredictionAt) : null;
      const lastEvent = events.find((e) => String(e.sensorId) === sensorId)?.createdAt ?? null;

      s.lastPredictionAt = toIsoOrNull(lastPred);
      s.lastMlEventAt = toIsoOrNull(lastEvent);

      let st: IntelligenceHealthStatus = 'ok';
      let desc = 'Sensor cubierto por ML con actividad reciente.';
      let sugg = 'Continuar monitoreo normal.';

      const minutesPred = lastPred
        ? (now.getTime() - lastPred.getTime()) / 60000
        : Infinity;

      if (minutesPred > 60 && minutesPred < Infinity) {
        st = 'degraded';
        desc = 'Hace más de 1 hora que no se generan predicciones para este sensor.';
        sugg = 'Revisar si sigue recibiendo lecturas y si el runner está activo.';
      }

      s.status = st;
      s.description = desc;
      s.suggestion = sugg;

      healthBySensor.push(s);
    }

    const dto = new IntelligenceHealthDto();
    dto.summary = summary;
    dto.sensors = healthBySensor;
    return dto;
  }

  // ---------------------------------------------------------------------------
  // GET /intelligence/decisions
  // ---------------------------------------------------------------------------
  async listDecisions(
    limit = 50,
    status?: string,
    severity?: string,
  ): Promise<DecisionActionListResponseDto> {
    const qb = this.decisionRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.device', 'device')
      .orderBy('d.priority', 'ASC')
      .addOrderBy('d.createdAt', 'DESC')
      .limit(limit);

    // Filtrar por status si se proporciona
    if (status) {
      qb.andWhere('d.status = :status', { status });
    }

    // Filtrar por severity si se proporciona
    if (severity) {
      qb.andWhere('d.severity = :severity', { severity });
    }

    // Solo decisiones no expiradas
    qb.andWhere('(d.expiresAt IS NULL OR d.expiresAt > :now)', { now: new Date() });

    const [rows, total] = await qb.getManyAndCount();

    const decisions: DecisionActionDto[] = rows.map((d) => {
      const dto = new DecisionActionDto();
      dto.id = String(d.id);
      dto.deviceId = String(d.deviceId);
      dto.deviceName = d.device?.name ?? 'Dispositivo';
      dto.patternSignature = d.patternSignature;
      dto.decisionType = d.decisionType;
      dto.priority = d.priority;
      dto.severity = d.severity;
      dto.title = d.title;
      dto.summary = d.summary;
      dto.explanation = d.explanation ?? null;

      // Parsear recommended_actions
      let actions: any[] = [];
      try {
        if (d.recommendedActions) {
          actions = JSON.parse(d.recommendedActions);
        }
      } catch {
        actions = [];
      }
      dto.recommendedActions = actions;

      // Parsear affected_sensors
      let sensorIds: number[] = [];
      try {
        if (d.affectedSensors) {
          sensorIds = JSON.parse(d.affectedSensors);
        }
      } catch {
        sensorIds = [];
      }
      dto.affectedSensorIds = sensorIds;

      dto.eventCount = d.eventCount;
      dto.status = d.status;
      dto.shouldNotify = Boolean(d.shouldNotify);
      dto.createdAt = formatIso(d.createdAt);
      dto.expiresAt = toIsoOrNull(d.expiresAt);
      dto.acknowledgedAt = toIsoOrNull(d.acknowledgedAt);
      dto.resolvedAt = toIsoOrNull(d.resolvedAt);

      // Calcular edad en minutos
      const now = new Date();
      dto.ageMinutes = d.createdAt
        ? Math.round((now.getTime() - d.createdAt.getTime()) / 60000)
        : 0;

      return dto;
    });

    const response = new DecisionActionListResponseDto();
    response.decisions = decisions;
    response.total = total;
    return response;
  }

  // ---------------------------------------------------------------------------
  // PATCH /intelligence/decisions/:id/status
  // ---------------------------------------------------------------------------
  async updateDecisionStatus(
    decisionId: string,
    newStatus: 'acknowledged' | 'resolved',
  ): Promise<DecisionActionDto | null> {
    const id = parseInt(decisionId, 10);
    if (isNaN(id)) return null;

    const decision = await this.decisionRepo.findOne({
      where: { id },
      relations: ['device'],
    });

    if (!decision) return null;

    decision.status = newStatus;
    if (newStatus === 'acknowledged') {
      decision.acknowledgedAt = new Date();
    } else if (newStatus === 'resolved') {
      decision.resolvedAt = new Date();
    }

    await this.decisionRepo.save(decision);

    // Retornar DTO actualizado
    const dto = new DecisionActionDto();
    dto.id = String(decision.id);
    dto.deviceId = String(decision.deviceId);
    dto.deviceName = decision.device?.name ?? 'Dispositivo';
    dto.patternSignature = decision.patternSignature;
    dto.decisionType = decision.decisionType;
    dto.priority = decision.priority;
    dto.severity = decision.severity;
    dto.title = decision.title;
    dto.summary = decision.summary;
    dto.explanation = decision.explanation ?? null;
    dto.recommendedActions = decision.recommendedActions
      ? JSON.parse(decision.recommendedActions)
      : [];
    dto.affectedSensorIds = decision.affectedSensors
      ? JSON.parse(decision.affectedSensors)
      : [];
    dto.eventCount = decision.eventCount;
    dto.status = decision.status;
    dto.shouldNotify = Boolean(decision.shouldNotify);
    dto.createdAt = formatIso(decision.createdAt);
    dto.expiresAt = toIsoOrNull(decision.expiresAt);
    dto.acknowledgedAt = toIsoOrNull(decision.acknowledgedAt);
    dto.resolvedAt = toIsoOrNull(decision.resolvedAt);
    dto.ageMinutes = decision.createdAt
      ? Math.round((new Date().getTime() - decision.createdAt.getTime()) / 60000)
      : 0;

    return dto;
  }
}
