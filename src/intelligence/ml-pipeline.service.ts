import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan, IsNull, Not } from 'typeorm';
import { Prediction } from '../entities/prediction.entity';
import { MlEvent } from '../entities/ml-event.entity';
import { Sensor } from '../entities/sensor.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';

/**
 * Códigos de eventos ML
 */
export enum MlEventCode {
  PRED_THRESHOLD_BREACH = 'PRED_THRESHOLD_BREACH',  // Predicción cruza umbral
  ANOMALY_DETECTED = 'ANOMALY_DETECTED',            // Anomalía detectada por ML
  TREND_ALERT = 'TREND_ALERT',                      // Tendencia peligrosa
  DELTA_SPIKE = 'DELTA_SPIKE',                      // Cambio brusco (ya existe)
  HIGH_RISK = 'HIGH_RISK',                          // Nivel de riesgo alto
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',                // Predicción con baja confianza
}

/**
 * Tipos de eventos ML (severidad)
 */
export enum MlEventType {
  NOTICE = 'notice',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * Resultado del diagnóstico del pipeline ML
 */
export interface MlPipelineDiagnostic {
  timestamp: string;
  predictions: {
    total: number;
    withFutureTarget: number;
    withPastTarget: number;
    byRiskLevel: Record<string, number>;
    bySeverity: Record<string, number>;
    byAnomaly: { anomalies: number; normal: number };
  };
  mlEvents: {
    total: number;
    active: number;
    acknowledged: number;
    resolved: number;
    byEventCode: Record<string, number>;
  };
  conversion: {
    predictionsWithoutEvent: number;
    predictionsWithEvent: number;
    conversionRate: string;
  };
  issues: string[];
  recommendations: string[];
}

/**
 * Resultado de la conversión de predicciones a eventos
 */
export interface ConversionResult {
  processed: number;
  created: number;
  skipped: number;
  errors: string[];
  details: Array<{
    predictionId: string;
    action: 'created' | 'skipped' | 'error';
    reason?: string;
    eventId?: string;
  }>;
}

@Injectable()
export class MlPipelineService {
  private readonly logger = new Logger(MlPipelineService.name);

  constructor(
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
    @InjectRepository(MlEvent)
    private readonly mlEventRepo: Repository<MlEvent>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * DIAGNÓSTICO COMPLETO DEL PIPELINE ML
   * Identifica exactamente dónde se rompe la conversión prediction → ml_event
   */
  async diagnosePipeline(): Promise<MlPipelineDiagnostic> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 1. Contar predicciones
    const totalPredictions = await this.predictionRepo.count();
    
    const predictionsWithFutureTarget = await this.predictionRepo
      .createQueryBuilder('p')
      .where('p.target_timestamp > GETDATE()')
      .getCount();
    
    const predictionsWithPastTarget = totalPredictions - predictionsWithFutureTarget;

    // 2. Agrupar predicciones por risk_level
    const riskLevelAgg = await this.dataSource.query(`
      SELECT COALESCE(risk_level, 'NULL') as risk_level, COUNT(*) as cnt
      FROM predictions
      GROUP BY risk_level
    `);
    const byRiskLevel: Record<string, number> = {};
    for (const row of riskLevelAgg) {
      byRiskLevel[row.risk_level] = Number(row.cnt);
    }

    // 3. Agrupar predicciones por severity
    const severityAgg = await this.dataSource.query(`
      SELECT COALESCE(severity, 'NULL') as severity, COUNT(*) as cnt
      FROM predictions
      GROUP BY severity
    `);
    const bySeverity: Record<string, number> = {};
    for (const row of severityAgg) {
      bySeverity[row.severity] = Number(row.cnt);
    }

    // 4. Contar anomalías
    const anomalyAgg = await this.dataSource.query(`
      SELECT 
        SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) as anomalies,
        SUM(CASE WHEN is_anomaly = 0 OR is_anomaly IS NULL THEN 1 ELSE 0 END) as normal
      FROM predictions
    `);
    const anomalies = Number(anomalyAgg[0]?.anomalies ?? 0);
    const normal = Number(anomalyAgg[0]?.normal ?? 0);

    // 5. Contar ml_events
    const totalMlEvents = await this.mlEventRepo.count();
    
    const mlEventsByStatus = await this.dataSource.query(`
      SELECT status, COUNT(*) as cnt
      FROM ml_events
      GROUP BY status
    `);
    let activeEvents = 0, acknowledgedEvents = 0, resolvedEvents = 0;
    for (const row of mlEventsByStatus) {
      if (row.status === 'active') activeEvents = Number(row.cnt);
      else if (row.status === 'acknowledged') acknowledgedEvents = Number(row.cnt);
      else if (row.status === 'resolved') resolvedEvents = Number(row.cnt);
    }

    // 6. Agrupar ml_events por event_code
    const eventCodeAgg = await this.dataSource.query(`
      SELECT event_code, COUNT(*) as cnt
      FROM ml_events
      GROUP BY event_code
    `);
    const byEventCode: Record<string, number> = {};
    for (const row of eventCodeAgg) {
      byEventCode[row.event_code] = Number(row.cnt);
    }

    // 7. Verificar conversión: predicciones con/sin evento asociado
    const predictionsWithEvent = await this.dataSource.query(`
      SELECT COUNT(DISTINCT p.id) as cnt
      FROM predictions p
      INNER JOIN ml_events e ON e.prediction_id = p.id
    `);
    const withEvent = Number(predictionsWithEvent[0]?.cnt ?? 0);
    const withoutEvent = totalPredictions - withEvent;

    // 8. Identificar problemas
    if (totalPredictions > 0 && totalMlEvents === 0) {
      issues.push('🚨 CRÍTICO: Hay predicciones pero CERO eventos ML. El pipeline de conversión NO está funcionando.');
      recommendations.push('Ejecutar convertPredictionsToEvents() para procesar predicciones pendientes.');
    }

    if (withoutEvent > 0) {
      issues.push(`⚠️ ${withoutEvent} predicciones no tienen evento ML asociado.`);
      recommendations.push('Revisar criterios de conversión o ejecutar conversión manual.');
    }

    if (anomalies > 0 && !byEventCode[MlEventCode.ANOMALY_DETECTED]) {
      issues.push(`⚠️ Hay ${anomalies} anomalías detectadas pero ningún evento ANOMALY_DETECTED.`);
      recommendations.push('Las anomalías deberían generar eventos ML automáticamente.');
    }

    const highRiskCount = (byRiskLevel['high'] ?? 0) + (byRiskLevel['critical'] ?? 0);
    if (highRiskCount > 0 && !byEventCode[MlEventCode.HIGH_RISK]) {
      issues.push(`⚠️ Hay ${highRiskCount} predicciones de alto riesgo pero ningún evento HIGH_RISK.`);
    }

    if (issues.length === 0) {
      issues.push('✅ Pipeline ML funcionando correctamente.');
    }

    const conversionRate = totalPredictions > 0 
      ? ((withEvent / totalPredictions) * 100).toFixed(1) + '%'
      : 'N/A';

    return {
      timestamp: new Date().toISOString(),
      predictions: {
        total: totalPredictions,
        withFutureTarget: predictionsWithFutureTarget,
        withPastTarget: predictionsWithPastTarget,
        byRiskLevel,
        bySeverity,
        byAnomaly: { anomalies, normal },
      },
      mlEvents: {
        total: totalMlEvents,
        active: activeEvents,
        acknowledged: acknowledgedEvents,
        resolved: resolvedEvents,
        byEventCode,
      },
      conversion: {
        predictionsWithoutEvent: withoutEvent,
        predictionsWithEvent: withEvent,
        conversionRate,
      },
      issues,
      recommendations,
    };
  }

  /**
   * CONVERTIR PREDICCIONES A EVENTOS ML
   * Procesa predicciones que deberían generar eventos pero no lo han hecho.
   */
  async convertPredictionsToEvents(options?: {
    limit?: number;
    onlyAnomalies?: boolean;
    onlyHighRisk?: boolean;
    dryRun?: boolean;
  }): Promise<ConversionResult> {
    const limit = options?.limit ?? 100;
    const dryRun = options?.dryRun ?? false;

    const result: ConversionResult = {
      processed: 0,
      created: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    // Buscar predicciones sin evento ML asociado
    let query = this.predictionRepo
      .createQueryBuilder('p')
      .leftJoin('ml_events', 'e', 'e.prediction_id = p.id')
      .leftJoinAndSelect('p.sensor', 'sensor')
      .leftJoinAndSelect('sensor.device', 'device')
      .leftJoinAndSelect('p.model', 'model')
      .where('e.id IS NULL'); // Sin evento asociado

    if (options?.onlyAnomalies) {
      query = query.andWhere('p.is_anomaly = 1');
    }

    if (options?.onlyHighRisk) {
      query = query.andWhere("p.risk_level IN ('high', 'critical')");
    }

    query = query.orderBy('p.predicted_at', 'DESC').limit(limit);

    const predictions = await query.getMany();
    result.processed = predictions.length;

    for (const pred of predictions) {
      try {
        // Determinar si esta predicción merece un evento
        const eventInfo = await this.evaluatePredictionForEvent(pred);

        if (!eventInfo.shouldCreate) {
          result.skipped++;
          result.details.push({
            predictionId: pred.id,
            action: 'skipped',
            reason: eventInfo.reason,
          });
          continue;
        }

        if (dryRun) {
          result.created++;
          result.details.push({
            predictionId: pred.id,
            action: 'created',
            reason: `[DRY RUN] Would create ${eventInfo.eventCode} event`,
          });
          continue;
        }

        // Crear el evento ML
        const event = await this.createMlEventFromPrediction(pred, eventInfo);
        result.created++;
        result.details.push({
          predictionId: pred.id,
          action: 'created',
          eventId: event.id,
          reason: `Created ${eventInfo.eventCode} event`,
        });

      } catch (err) {
        const errMsg = (err as Error).message;
        result.errors.push(`Prediction ${pred.id}: ${errMsg}`);
        result.details.push({
          predictionId: pred.id,
          action: 'error',
          reason: errMsg,
        });
      }
    }

    this.logger.log(`Conversion complete: ${result.created} created, ${result.skipped} skipped, ${result.errors.length} errors`);
    return result;
  }

  /**
   * Evalúa si una predicción debe generar un evento ML
   */
  private async evaluatePredictionForEvent(pred: Prediction): Promise<{
    shouldCreate: boolean;
    eventCode?: MlEventCode;
    eventType?: MlEventType;
    reason: string;
  }> {
    // 1. Anomalía detectada → ANOMALY_DETECTED
    if (pred.isAnomaly === 1) {
      return {
        shouldCreate: true,
        eventCode: MlEventCode.ANOMALY_DETECTED,
        eventType: MlEventType.WARNING,
        reason: 'Anomaly detected by ML model',
      };
    }

    // 2. Riesgo alto/crítico → HIGH_RISK
    if (pred.riskLevel === 'high' || pred.riskLevel === 'critical') {
      return {
        shouldCreate: true,
        eventCode: MlEventCode.HIGH_RISK,
        eventType: pred.riskLevel === 'critical' ? MlEventType.CRITICAL : MlEventType.WARNING,
        reason: `High risk level: ${pred.riskLevel}`,
      };
    }

    // 3. Severidad warning/critical → evento correspondiente
    if (pred.severity === 'critical' || pred.severity === 'warning') {
      return {
        shouldCreate: true,
        eventCode: MlEventCode.PRED_THRESHOLD_BREACH,
        eventType: pred.severity === 'critical' ? MlEventType.CRITICAL : MlEventType.WARNING,
        reason: `Prediction severity: ${pred.severity}`,
      };
    }

    // 4. Verificar si el valor predicho cruza umbrales
    if (pred.sensor) {
      const thresholds = await this.thresholdRepo.find({
        where: { sensor: { id: pred.sensor.id } },
      });

      const predValue = Number(pred.predictedValue);
      for (const th of thresholds) {
        const min = th.thresholdValueMin !== null ? Number(th.thresholdValueMin) : null;
        const max = th.thresholdValueMax !== null ? Number(th.thresholdValueMax) : null;

        const breachesMin = min !== null && predValue < min;
        const breachesMax = max !== null && predValue > max;

        if (breachesMin || breachesMax) {
          return {
            shouldCreate: true,
            eventCode: MlEventCode.PRED_THRESHOLD_BREACH,
            eventType: th.severity === 'critical' ? MlEventType.CRITICAL : MlEventType.WARNING,
            reason: `Predicted value ${predValue} breaches ${th.severity} threshold`,
          };
        }
      }
    }

    // 5. Tendencia peligrosa
    if (pred.trend === 'up' || pred.trend === 'down') {
      // Solo alertar si la tendencia es significativa (confianza > 0.7)
      const confidence = Number(pred.confidence);
      if (confidence > 0.7) {
        return {
          shouldCreate: true,
          eventCode: MlEventCode.TREND_ALERT,
          eventType: MlEventType.NOTICE,
          reason: `Significant trend detected: ${pred.trend} (confidence: ${confidence})`,
        };
      }
    }

    // No cumple criterios para evento
    return {
      shouldCreate: false,
      reason: 'Prediction does not meet criteria for ML event',
    };
  }

  /**
   * Crea un evento ML a partir de una predicción
   */
  private async createMlEventFromPrediction(
    pred: Prediction,
    eventInfo: { eventCode?: MlEventCode; eventType?: MlEventType; reason: string },
  ): Promise<MlEvent> {
    const sensorName = pred.sensor?.name ?? 'Unknown Sensor';
    const deviceId = pred.sensor?.device?.id ?? pred.device?.id;

    if (!deviceId) {
      throw new Error('Cannot create event: no device associated with prediction');
    }

    const title = this.generateEventTitle(eventInfo.eventCode!, sensorName);
    const message = this.generateEventMessage(pred, eventInfo);

    const payload = JSON.stringify({
      predictionId: pred.id,
      predictedValue: pred.predictedValue,
      confidence: pred.confidence,
      targetTimestamp: pred.targetTimestamp,
      trend: pred.trend,
      isAnomaly: pred.isAnomaly,
      anomalyScore: pred.anomalyScore,
      riskLevel: pred.riskLevel,
      modelName: pred.model?.modelName,
      reason: eventInfo.reason,
    });

    const event = this.mlEventRepo.create({
      deviceId: deviceId,
      sensorId: pred.sensor?.id ?? null,
      predictionId: pred.id,
      eventType: eventInfo.eventType!,
      eventCode: eventInfo.eventCode!,
      title,
      message,
      status: 'active',
      payload,
    });

    return this.mlEventRepo.save(event);
  }

  /**
   * Genera título para el evento
   */
  private generateEventTitle(eventCode: MlEventCode, sensorName: string): string {
    switch (eventCode) {
      case MlEventCode.ANOMALY_DETECTED:
        return `Anomalía Detectada - ${sensorName}`;
      case MlEventCode.HIGH_RISK:
        return `Riesgo Alto - ${sensorName}`;
      case MlEventCode.PRED_THRESHOLD_BREACH:
        return `Predicción de Umbral - ${sensorName}`;
      case MlEventCode.TREND_ALERT:
        return `Tendencia Detectada - ${sensorName}`;
      case MlEventCode.LOW_CONFIDENCE:
        return `Baja Confianza - ${sensorName}`;
      default:
        return `Evento ML - ${sensorName}`;
    }
  }

  /**
   * Genera mensaje descriptivo para el evento
   */
  private generateEventMessage(
    pred: Prediction,
    eventInfo: { eventCode?: MlEventCode; eventType?: MlEventType; reason: string },
  ): string {
    const predValue = Number(pred.predictedValue).toFixed(2);
    const confidence = (Number(pred.confidence) * 100).toFixed(0);
    const targetTime = pred.targetTimestamp?.toISOString?.() ?? 'N/A';

    let msg = `Predicción: ${predValue} (confianza: ${confidence}%). `;
    msg += `Objetivo: ${targetTime}. `;
    msg += eventInfo.reason;

    if (pred.explanation) {
      msg += ` Explicación: ${pred.explanation}`;
    }

    return msg;
  }

  /**
   * Obtiene estadísticas del modelo ML
   */
  async getModelStats(): Promise<{
    totalPredictions: number;
    recentPredictions: number;
    avgConfidence: number;
    anomalyRate: number;
    predictionsByModel: Array<{ modelName: string; count: number; avgConfidence: number }>;
  }> {
    const total = await this.predictionRepo.count();
    
    const recent = await this.predictionRepo
      .createQueryBuilder('p')
      .where('p.predicted_at > DATEADD(hour, -24, GETDATE())')
      .getCount();

    const avgConfidenceResult = await this.dataSource.query(`
      SELECT AVG(CAST(confidence AS FLOAT)) as avg_conf
      FROM predictions
      WHERE predicted_at > DATEADD(day, -7, GETDATE())
    `);
    const avgConfidence = Number(avgConfidenceResult[0]?.avg_conf ?? 0);

    const anomalyResult = await this.dataSource.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) as anomalies
      FROM predictions
      WHERE predicted_at > DATEADD(day, -7, GETDATE())
    `);
    const anomalyRate = anomalyResult[0]?.total > 0
      ? (anomalyResult[0].anomalies / anomalyResult[0].total)
      : 0;

    const byModel = await this.dataSource.query(`
      SELECT 
        COALESCE(m.model_name, 'Unknown') as model_name,
        COUNT(*) as cnt,
        AVG(CAST(p.confidence AS FLOAT)) as avg_conf
      FROM predictions p
      LEFT JOIN ml_models m ON p.model_id = m.id
      GROUP BY m.model_name
      ORDER BY cnt DESC
    `);

    return {
      totalPredictions: total,
      recentPredictions: recent,
      avgConfidence,
      anomalyRate,
      predictionsByModel: byModel.map((r: any) => ({
        modelName: r.model_name,
        count: Number(r.cnt),
        avgConfidence: Number(r.avg_conf ?? 0),
      })),
    };
  }
}
