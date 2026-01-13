import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SensorTelemetryState,
  SensorFinalState,
  evaluateTelemetryState,
  STALE_THRESHOLD_MS,
} from '../common/sensor-states';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Device } from '../entities/device.entity';
import { Sensor } from '../entities/sensor.entity';
import { SensorReading } from '../entities/sensor-reading.entity';
import { Alert } from '../entities/alert.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';
import { ThresholdHistory } from '../entities/threshold-history.entity';
import { Prediction } from '../entities/prediction.entity';
import {
  DeviceWithSensorsView,
  ActiveAlertView,
  LatestSensorReadingView,
  MlEventActiveView,
} from '../entities/views';

@Injectable()
export class MonitoringService {
  // repositorios principales para leer datos del sistema iot ovbiamente de manera privada y que nadie mas vea xddddd
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(SensorReading)
    private readonly sensorReadingRepo: Repository<SensorReading>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
    @InjectRepository(ThresholdHistory)
    private readonly thresholdHistoryRepo: Repository<ThresholdHistory>,
    @InjectRepository(DeviceWithSensorsView)
    private readonly deviceWithSensorsViewRepo: Repository<DeviceWithSensorsView>,
    @InjectRepository(ActiveAlertView)
    private readonly activeAlertViewRepo: Repository<ActiveAlertView>,
    @InjectRepository(LatestSensorReadingView)
    private readonly latestSensorReadingViewRepo: Repository<LatestSensorReadingView>,
    @InjectRepository(MlEventActiveView)
    private readonly mlEventActiveViewRepo: Repository<MlEventActiveView>,
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
    private readonly dataSource: DataSource,
  ) {}

  private parseOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  private getLimitBounds(sensorType: string, unit: string): { min: number; max: number } {
    const t = (sensorType || '').toLowerCase().trim();
    const u = (unit || '').toLowerCase().trim();

    // Rangos “realistas” (ajústalos a tu dominio). La idea es frenar inputs absurdos
    // que luego rompan reportes / reglas / SPs o generen ruido.
    if (t === 'temperature' || u.includes('°c') || u === 'c') {
      return { min: -50, max: 150 };
    }
    if (t === 'humidity' || u === '%') {
      return { min: 0, max: 100 };
    }
    if (t === 'air_quality' || u === 'ppm') {
      return { min: 0, max: 5000 };
    }
    if (t === 'voltage' || u === 'v' || u.includes('volt')) {
      return { min: 0, max: 600 };
    }
    if (t === 'power' || u === 'w' || u === 'kw') {
      return { min: 0, max: 100000 };
    }

    // Default: rango amplio (pero no infinito)
    return { min: -1000000000, max: 1000000000 };
  }

  private validateLimitPayload(args: {
    sensorType: string;
    unit: string;
    conditionType: string;
    thresholdValueMin: unknown;
    thresholdValueMax: unknown;
  }) {
    const condition = (args.conditionType || '').toLowerCase().trim();

    const allowed = new Set(['greater_than', 'less_than', 'equal_to', 'out_of_range']);
    if (!allowed.has(condition)) {
      throw new BadRequestException('Condición inválida para el límite.');
    }
      //se supone que son los limite de los umbrales 
    const min = this.parseOptionalNumber(args.thresholdValueMin);
    const max = this.parseOptionalNumber(args.thresholdValueMax);

    if (condition === 'out_of_range') {
      if (min === null || max === null) {
        throw new BadRequestException('Para "fuera de rango" debes indicar mínimo y máximo.');
      }
      if (min > max) {
        throw new BadRequestException('El mínimo no puede ser mayor al máximo.');
      }
    } else {
      // greater_than / less_than / equal_to
      if (min === null) {
        throw new BadRequestException('Debes indicar el valor del límite.');
      }
    }

    const bounds = this.getLimitBounds(args.sensorType, args.unit);

    const checkOne = (label: string, v: number) => {
      if (v < bounds.min || v > bounds.max) {
        const unitSuffix = args.unit && args.unit.trim() ? ` ${args.unit}` : '';
        throw new BadRequestException(
          `${label} fuera de rango realista para este sensor (permitido: ${bounds.min} a ${bounds.max}${unitSuffix}).`,
        );
      }
    };

    if (min !== null) checkOne('Valor', min);
    if (max !== null) checkOne('Valor', max);

    return { min, max, conditionType: condition };
  }

  // convierte fechas a un texto sencillo para mostrar en el dashboard normalmente seria lo indicado ya que el front solo toma los datos directamente 
  private formatDateTime(value: Date | string | null): string | null {
    if (!value) {
      return null;
    }

    const date = typeof value === 'string' ? new Date(value) : value;

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  /**
   * Lista dispositivos con sus sensores (vista v_devices_with_sensors)
   */
  async getDevicesWithSensors() {
    const rows = await this.deviceWithSensorsViewRepo.find();
    return rows.map((row) => ({
      ...row,
      lastConnection: this.formatDateTime(row.lastConnection ?? null),
    }));
  }

  /**
   * Devuelve las últimas lecturas por sensor (vista v_latest_sensor_readings)
   */
  async getLatestSensorReadings() {
    const rows = await this.latestSensorReadingViewRepo.find();
    return rows.map((row) => ({
      ...row,
      latestTimestamp: this.formatDateTime(row.latestTimestamp ?? null),
    }));
  }

  /**
   * Devuelve alertas activas/acknowledged (vista v_active_alerts)
   */
  async getActiveAlerts(limit = 100) {
    const rows = await this.activeAlertViewRepo
      .createQueryBuilder('a')
      .orderBy('a.triggeredAt', 'DESC')
      .limit(limit)
      .getMany();
    return rows.map((row) => ({
      ...row,
      triggeredAt: this.formatDateTime(row.triggeredAt ?? null),
    }));
  }

  /**
   * Devuelve eventos ML activos/acknowledged (vista v_ml_events_active)
   */
  async getActiveMlEvents(limit = 50) {
    const rows = await this.mlEventActiveViewRepo
      .createQueryBuilder('e')
      .orderBy('e.createdAt', 'DESC')
      .limit(limit)
      .getMany();

    return rows.map((row) => ({
      ...row,
      createdAt: this.formatDateTime(row.createdAt ?? null),
      targetTimestamp: this.formatDateTime(row.targetTimestamp ?? null),
    }));
  }

  /**
   * Devuelve las últimas predicciones generadas por modelos ML.
   * TAREA 2: Solo devuelve la predicción más reciente por sensor (deduplicación).
   */
  async getLatestPredictions(limit = 50) {
    // Query con ROW_NUMBER para obtener solo la predicción más reciente por sensor
    const rows = await this.dataSource.query(`
      WITH RankedPredictions AS (
        SELECT 
          p.id,
          p.predicted_value,
          p.confidence,
          p.predicted_at,
          p.target_timestamp,
          p.sensor_id,
          p.model_id,
          s.name AS sensor_name,
          s.unit,
          d.name AS device_name,
          m.model_name,
          m.version AS model_version,
          ROW_NUMBER() OVER (PARTITION BY p.sensor_id ORDER BY p.predicted_at DESC) as rn
        FROM predictions p
        INNER JOIN sensors s ON p.sensor_id = s.id
        LEFT JOIN devices d ON s.device_id = d.id
        LEFT JOIN ml_models m ON p.model_id = m.id
        WHERE p.target_timestamp > GETDATE()
      )
      SELECT TOP (@0) * FROM RankedPredictions WHERE rn = 1
      ORDER BY target_timestamp ASC
    `, [limit]);

    return rows.map((p: any) => ({
      id: p.id,
      predictedValue: p.predicted_value,
      confidence: p.confidence,
      predictedAt: this.formatDateTime(p.predicted_at),
      targetTimestamp: this.formatDateTime(p.target_timestamp),
      sensorName: p.sensor_name,
      unit: p.unit,
      deviceName: p.device_name ?? '',
      modelName: p.model_name,
      modelVersion: p.model_version,
    }));
  }

  /**
   * Inserta una lectura para un sensor usando el SP sp_insert_reading_and_check_threshold
   * Esto también evaluará los umbrales y generará alertas si corresponde.
   * 
   * FIX: SQL Server no soporta ? como placeholder. Usar @0, @1 para TypeORM.
   */
  async insertSensorReading(sensorId: number, value: number) {
    await this.dataSource.query(
      'EXEC sp_insert_reading_and_check_threshold @p_sensor_id = @0, @p_value = @1',
      [sensorId, value],
    );
  }

  async getDeviceById(id: number) {
    return this.deviceRepo.findOne({ where: { id: String(id) } });
  }

  async getSensorReadings(sensorId: number, limit = 100) {
    return this.sensorReadingRepo.find({
      where: { sensor: { id: String(sensorId) } },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Umbrales configurados del sensor.
   * Importante: son por sensor (no por device), para soportar devices con múltiples sensores
   * (ej: nevera = temperatura + humedad, cada uno con sus propios thresholds).
   */
  async getSensorThresholds(sensorId: number) {
    const rows = await this.thresholdRepo.find({
      where: {
        sensorId: String(sensorId),
        isActive: true,
      },
      order: {
        severity: 'DESC',
        id: 'ASC',
      },
    });

    return rows.map((t) => ({
      id: t.id,
      sensorId: t.sensorId,
      name: t.name,
      conditionType: t.conditionType,
      thresholdValueMin: t.thresholdValueMin,
      thresholdValueMax: t.thresholdValueMax,
      severity: t.severity,
      isActive: t.isActive,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async createSensorThreshold(
    sensorId: number,
    body: {
      name: string;
      conditionType: 'greater_than' | 'less_than' | 'equal_to' | 'out_of_range';
      thresholdValueMin?: number | null;
      thresholdValueMax?: number | null;
      severity?: 'info' | 'warning' | 'critical';
    },
  ) {
    // Regla de producto: 1 límite activo por sensor., suponiendo que existan reglas por sensor ya ma especificas 
    const existing = await this.thresholdRepo.findOne({
      where: {
        sensorId: String(sensorId),
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Este sensor ya tiene un límite activo. Edita el existente en lugar de crear uno nuevo.',//Supuestamente como si eso fuera  a pasar sinceramente 
      );
    }

    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
    });

    if (!sensor) {
      throw new NotFoundException('Sensor no existe');
    }

    const validated = this.validateLimitPayload({
      sensorType: sensor.sensorType,
      unit: sensor.unit,
      conditionType: body.conditionType,
      thresholdValueMin: body.thresholdValueMin,
      thresholdValueMax: body.thresholdValueMax,
    });

    const t = this.thresholdRepo.create({
      sensorId: String(sensorId),
      name: body.name,
      conditionType: validated.conditionType as any,
      thresholdValueMin: validated.min === null ? null : String(validated.min),
      thresholdValueMax: validated.max === null ? null : String(validated.max),
      severity: body.severity ?? 'warning',
      isActive: true,
      createdAt: new Date(),
      updatedAt: null,
    });

    const saved = await this.thresholdRepo.save(t);
    return {
      id: saved.id,
      sensorId: saved.sensorId,
      name: saved.name,
      conditionType: saved.conditionType,
      thresholdValueMin: saved.thresholdValueMin,
      thresholdValueMax: saved.thresholdValueMax,
      severity: saved.severity,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  /**
   * Actualiza un threshold y guarda historial ANTES de sobrescribir. tiene sentido
   */
  async updateThreshold(
    thresholdId: number,
    changedByUserId: string,
    body: {
      thresholdValueMin?: number | null;
      thresholdValueMax?: number | null;
      severity?: 'info' | 'warning' | 'critical';
      name?: string;
      reason?: string | null;
    },
  ) {
    const t = await this.thresholdRepo.findOne({ where: { id: String(thresholdId) } });
    if (!t) {
      throw new NotFoundException('Límite no existe');
    }

    const sensor = await this.sensorRepo.findOne({
      where: { id: String(t.sensorId) },
    });

    if (!sensor) {
      throw new NotFoundException('Sensor no existe');
    }

    const oldMin = t.thresholdValueMin ?? null;
    const oldMax = t.thresholdValueMax ?? null;

    // Nuevo payload propuesto (si no viene, mantenemos el actual) ovbiamente para no hacerlo papilla xd
    const proposedMin = body.thresholdValueMin === undefined ? oldMin : body.thresholdValueMin;
    const proposedMax = body.thresholdValueMax === undefined ? oldMax : body.thresholdValueMax;

    const validated = this.validateLimitPayload({
      sensorType: sensor.sensorType,
      unit: sensor.unit,
      conditionType: t.conditionType,
      thresholdValueMin: proposedMin,
      thresholdValueMax: proposedMax,
    });

    const newMin = validated.min === null ? null : String(validated.min);
    const newMax = validated.max === null ? null : String(validated.max);

    // historial
    const h = this.thresholdHistoryRepo.create({
      thresholdId: t.id,
      oldMin,
      oldMax,
      newMin,
      newMax,
      changedBy: changedByUserId,
      changedAt: new Date(),
      reason: body.reason ?? null,
    });
    await this.thresholdHistoryRepo.save(h);

    // update
    if (body.name !== undefined) t.name = body.name;
    if (body.severity !== undefined) t.severity = body.severity;
    t.thresholdValueMin = newMin;
    t.thresholdValueMax = newMax;
    t.updatedAt = new Date();

    const saved = await this.thresholdRepo.save(t);

    return {
      id: saved.id,
      sensorId: saved.sensorId,
      name: saved.name,
      conditionType: saved.conditionType,
      thresholdValueMin: saved.thresholdValueMin,
      thresholdValueMax: saved.thresholdValueMax,
      severity: saved.severity,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  async deactivateThreshold(
    thresholdId: number,
    changedByUserId: string,
    reason?: string | null,
  ) {
    const t = await this.thresholdRepo.findOne({ where: { id: String(thresholdId) } });
    if (!t) {
      throw new NotFoundException('Límite no existe');
    }

    // historial: min/max no cambian, pero queda auditado el evento por lo menos
    const h = this.thresholdHistoryRepo.create({
      thresholdId: t.id,
      oldMin: t.thresholdValueMin ?? null,
      oldMax: t.thresholdValueMax ?? null,
      newMin: t.thresholdValueMin ?? null,
      newMax: t.thresholdValueMax ?? null,
      changedBy: changedByUserId,
      changedAt: new Date(),
      reason: reason ?? 'deactivated',
    });
    await this.thresholdHistoryRepo.save(h);

    t.isActive = false;
    t.updatedAt = new Date();
    const saved = await this.thresholdRepo.save(t);
    return { success: true, id: saved.id, isActive: saved.isActive };
  }

  async getThresholdHistory(thresholdId: number) {
    const rows = await this.thresholdHistoryRepo.find({
      where: { thresholdId: String(thresholdId) },
      order: { changedAt: 'DESC' },
    });

    return rows.map((h) => ({
      id: h.id,
      thresholdId: h.thresholdId,
      oldMin: h.oldMin,
      oldMax: h.oldMax,
      newMin: h.newMin,
      newMax: h.newMax,
      changedBy: h.changedBy,
      changedAt: this.formatDateTime(h.changedAt) ?? '-',
      reason: h.reason,
    }));
  }

  /**
   * Estado consolidado de un sensor: última lectura, alertas activas, warnings, predicciones, estado.
   * 
   * FIX AUDITORIA: Ahora evalúa correctamente el estado final considerando:
   * 1. Alertas activas (tabla alerts)
   * 2. Valor actual vs umbrales (evaluación en tiempo real)
   * 3. Warnings activos (tabla ml_events con DELTA_SPIKE)
   * 4. Predicciones de breach
   */
  async getSensorConsolidatedStatus(sensorId: number) {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });
    if (!sensor) {
      throw new NotFoundException('Sensor no encontrado');
    }

    // Obtener datos en paralelo para mejor performance
    const [latestReading, activeAlerts, activeWarnings, latestPrediction, thresholds] = await Promise.all([
      this.sensorReadingRepo.findOne({
        where: { sensor: { id: String(sensorId) } },
        order: { timestamp: 'DESC' },
      }),
      this.alertRepo.find({
        where: {
          sensor: { id: String(sensorId) },
          status: 'active',
        },
        relations: ['threshold'],
        order: { triggeredAt: 'DESC' },
        take: 5,
      }),
      this.mlEventActiveViewRepo.find({
        where: { sensorId: String(sensorId) },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
      this.predictionRepo.findOne({
        where: { sensor: { id: String(sensorId) } },
        relations: ['model'],
        order: { predictedAt: 'DESC' },
      }),
      this.getSensorThresholds(sensorId),
    ]);

    // Extraer umbrales para evaluación
    const warningThreshold = thresholds.find((t) => t.severity === 'warning');
    const alertThreshold = thresholds.find((t) => t.severity === 'critical');

    // Evaluar estado del valor actual contra umbrales
    const currentValue = latestReading?.value !== null && latestReading?.value !== undefined
      ? Number(latestReading.value)
      : null;

    const telemetryState = evaluateTelemetryState(currentValue, {
      warningMin: warningThreshold?.thresholdValueMin !== null ? Number(warningThreshold?.thresholdValueMin) : null,
      warningMax: warningThreshold?.thresholdValueMax !== null ? Number(warningThreshold?.thresholdValueMax) : null,
      alertMin: alertThreshold?.thresholdValueMin !== null ? Number(alertThreshold?.thresholdValueMin) : null,
      alertMax: alertThreshold?.thresholdValueMax !== null ? Number(alertThreshold?.thresholdValueMax) : null,
    });

    // Verificar si predicción cruzaría umbrales
    let predictionWouldBreach = false;
    if (latestPrediction) {
      const predValue = Number(latestPrediction.predictedValue);
      const predState = evaluateTelemetryState(predValue, {
        warningMin: warningThreshold?.thresholdValueMin !== null ? Number(warningThreshold?.thresholdValueMin) : null,
        warningMax: warningThreshold?.thresholdValueMax !== null ? Number(warningThreshold?.thresholdValueMax) : null,
        alertMin: alertThreshold?.thresholdValueMin !== null ? Number(alertThreshold?.thresholdValueMin) : null,
        alertMax: alertThreshold?.thresholdValueMax !== null ? Number(alertThreshold?.thresholdValueMax) : null,
      });
      predictionWouldBreach = predState !== SensorTelemetryState.NORMAL;
    }

    // AUDITORIA 3.6: Detectar sensor STALE (sin datos recientes)
    const now = new Date();
    const lastReadingTime = latestReading?.timestamp ? new Date(latestReading.timestamp).getTime() : 0;
    const timeSinceLastReading = now.getTime() - lastReadingTime;
    const isStale = lastReadingTime === 0 || timeSinceLastReading > STALE_THRESHOLD_MS;

    // Calcular estado final con prioridad: STALE > ALERT > WARNING > PREDICTION > NORMAL
    let finalState: string;
    if (isStale) {
      finalState = SensorFinalState.STALE;
    } else if (activeAlerts.length > 0 || telemetryState === SensorTelemetryState.ALERT) {
      finalState = SensorFinalState.ALERT;
    } else if (activeWarnings.length > 0 || telemetryState === SensorTelemetryState.WARNING) {
      finalState = SensorFinalState.WARNING;
    } else if (latestPrediction && predictionWouldBreach) {
      finalState = SensorFinalState.PREDICTION;
    } else {
      finalState = SensorFinalState.NORMAL;
    }

    // Formatear warning activo para respuesta
    const warningActive = activeWarnings.length > 0 ? {
      id: activeWarnings[0].eventId,
      sensor_id: activeWarnings[0].sensorId,
      device_id: activeWarnings[0].deviceId,
      event_type: activeWarnings[0].eventType,
      event_code: activeWarnings[0].eventCode,
      status: activeWarnings[0].status,
      created_at: this.formatDateTime(activeWarnings[0].createdAt),
      title: activeWarnings[0].title,
      message: activeWarnings[0].message,
    } : null;

    // Formatear predicción para respuesta
    const predictionCurrent = latestPrediction ? {
      id: latestPrediction.id,
      sensor_id: String(sensorId),
      model_id: latestPrediction.model?.id ?? null,
      predicted_value: latestPrediction.predictedValue,
      confidence: latestPrediction.confidence,
      predicted_at: this.formatDateTime(latestPrediction.predictedAt),
      target_timestamp: this.formatDateTime(latestPrediction.targetTimestamp),
    } : null;

    // Formatear alerta activa para respuesta
    const alertActive = activeAlerts.length > 0 ? {
      id: activeAlerts[0].id,
      sensor_id: String(sensorId),
      device_id: sensor.device?.id ?? null,
      threshold_id: activeAlerts[0].threshold?.id ?? null,
      severity: activeAlerts[0].severity,
      status: activeAlerts[0].status,
      triggered_value: activeAlerts[0].triggeredValue,
      triggered_at: this.formatDateTime(activeAlerts[0].triggeredAt),
    } : null;

    return {
      sensor_id: sensor.id,
      final_state: finalState,
      alert_active: alertActive,
      warning_active: warningActive,
      prediction_current: predictionCurrent,
      // Campos adicionales para compatibilidad
      sensorId: sensor.id,
      sensorName: sensor.name,
      sensorType: sensor.sensorType,
      unit: sensor.unit,
      deviceId: sensor.device?.id ?? null,
      deviceName: sensor.device?.name ?? null,
      latestValue: latestReading?.value ?? null,
      latestTimestamp: this.formatDateTime(latestReading?.timestamp ?? null),
      activeAlertsCount: activeAlerts.length,
      activeAlerts: activeAlerts.map((a) => ({
        id: a.id,
        severity: a.severity,
        triggeredValue: a.triggeredValue,
        triggeredAt: this.formatDateTime(a.triggeredAt),
      })),
      thresholds,
      status: finalState,
    };
  }

  /**
   * Estado consolidado en batch para múltiples sensores.
   * FASE 3: Límite máximo de IDs para prevenir DoS
   */
  private static readonly MAX_BATCH_SIZE = 100;

  async getSensorConsolidatedStatusBatch(idsRaw: string) {
    const ids = (idsRaw || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !isNaN(Number(s)))
      .map(Number);

    if (ids.length === 0) {
      return [];
    }

    // FASE 3: Validación de longitud máxima
    if (ids.length > MonitoringService.MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `Máximo ${MonitoringService.MAX_BATCH_SIZE} sensores por batch. Recibidos: ${ids.length}`
      );
    }

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return await this.getSensorConsolidatedStatus(id);
        } catch {
          return { sensorId: id, error: 'not_found' };
        }
      }),
    );

    return results;
  }

  /**
   * Métricas agregadas del sensor en una ventana de tiempo.
   */
  async getSensorMetrics(sensorId: number, window = '1h') {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
    });
    if (!sensor) {
      throw new NotFoundException('Sensor no encontrado');
    }

    const windowMap: Record<string, number> = {
      '1h': 1,
      '6h': 6,
      '12h': 12,
      '24h': 24,
      '7d': 168,
    };
    const hours = windowMap[window] || 1;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const readings = await this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('r.timestamp >= :since', { since })
      .orderBy('r.timestamp', 'ASC')
      .getMany();

    if (readings.length === 0) {
      return {
        sensorId,
        window,
        count: 0,
        min: null,
        max: null,
        avg: null,
        readings: [],
      };
    }

    const values = readings.map((r) => Number(r.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    return {
      sensorId,
      window,
      count: readings.length,
      min,
      max,
      avg: Math.round(avg * 100) / 100,
      readings: readings.map((r) => ({
        value: r.value,
        timestamp: this.formatDateTime(r.timestamp),
      })),
    };
  }

  /**
   * Alias canónico para getSensorThresholds (compatibilidad con frontend).
   */
  async getSensorThresholdsCanonical(sensorId: number) {
    return this.getSensorThresholds(sensorId);
  }

  /**
   * Historial de alertas de un sensor.
   */
  async getSensorAlertsHistory(sensorId: number, limit = 50) {
    const alerts = await this.alertRepo.find({
      where: { sensor: { id: String(sensorId) } },
      order: { triggeredAt: 'DESC' },
      take: limit,
    });

    return alerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      status: a.status,
      triggeredValue: a.triggeredValue,
      triggeredAt: this.formatDateTime(a.triggeredAt),
      acknowledgedAt: this.formatDateTime(a.acknowledgedAt ?? null),
      resolvedAt: this.formatDateTime(a.resolvedAt ?? null),
    }));
  }

  /**
   * Perfil de umbrales del sensor (warning/alert levels).
   */
  async getSensorThresholdProfile(sensorId: number) {
    const thresholds = await this.getSensorThresholds(sensorId);
    
    const warning = thresholds.find((t) => t.severity === 'warning');
    const alert = thresholds.find((t) => t.severity === 'critical');

    return {
      sensorId,
      warningMin: warning?.thresholdValueMin ?? null,
      warningMax: warning?.thresholdValueMax ?? null,
      alertMin: alert?.thresholdValueMin ?? null,
      alertMax: alert?.thresholdValueMax ?? null,
      cooldownSeconds: 300, // default
    };
  }

  /**
   * Crea o actualiza perfil de umbrales del sensor.
   * Guarda en alert_thresholds: 1 registro "warning" y 1 registro "critical".
   */
  async upsertSensorThresholdProfile(
    sensorId: number,
    body: {
      warningMin?: number | null;
      warningMax?: number | null;
      alertMin?: number | null;
      alertMax?: number | null;
      cooldownSeconds?: number;
    },
  ) {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
    });
    if (!sensor) {
      throw new NotFoundException('Sensor no encontrado');
    }

    // Buscar umbrales existentes para este sensor
    const existingThresholds = await this.thresholdRepo.find({
      where: { sensor: { id: String(sensorId) } },
    });

    const warningThreshold = existingThresholds.find(t => t.severity === 'warning');
    const criticalThreshold = existingThresholds.find(t => t.severity === 'critical');

    // Upsert WARNING threshold
    if (body.warningMin !== undefined || body.warningMax !== undefined) {
      if (warningThreshold) {
        // Actualizar existente
        warningThreshold.thresholdValueMin = body.warningMin?.toString() ?? null;
        warningThreshold.thresholdValueMax = body.warningMax?.toString() ?? null;
        await this.thresholdRepo.save(warningThreshold);
      } else if (body.warningMin !== null || body.warningMax !== null) {
        // Crear nuevo si hay valores
        const newWarning = this.thresholdRepo.create({
          sensor,
          name: 'Warning Level',
          conditionType: 'out_of_range',
          thresholdValueMin: body.warningMin?.toString() ?? null,
          thresholdValueMax: body.warningMax?.toString() ?? null,
          severity: 'warning',
          isActive: true,
        });
        await this.thresholdRepo.save(newWarning);
      }
    }

    // Upsert CRITICAL/ALERT threshold
    if (body.alertMin !== undefined || body.alertMax !== undefined) {
      if (criticalThreshold) {
        // Actualizar existente
        criticalThreshold.thresholdValueMin = body.alertMin?.toString() ?? null;
        criticalThreshold.thresholdValueMax = body.alertMax?.toString() ?? null;
        await this.thresholdRepo.save(criticalThreshold);
      } else if (body.alertMin !== null || body.alertMax !== null) {
        // Crear nuevo si hay valores
        const newCritical = this.thresholdRepo.create({
          sensor,
          name: 'Alert Level',
          conditionType: 'out_of_range',
          thresholdValueMin: body.alertMin?.toString() ?? null,
          thresholdValueMax: body.alertMax?.toString() ?? null,
          severity: 'critical',
          isActive: true,
        });
        await this.thresholdRepo.save(newCritical);
      }
    }

    // Retornar el perfil actualizado (leer de DB para confirmar)
    return this.getSensorThresholdProfile(sensorId);
  }

  /**
   * Debug info de la base de datos para un sensor.
   */
  async getDbDebug(sensorId?: string) {
    const info: any = {
      timestamp: new Date().toISOString(),
    };

    if (sensorId) {
      const sensor = await this.sensorRepo.findOne({
        where: { id: sensorId },
        relations: ['device'],
      });
      info.sensor = sensor ?? 'not_found';

      const readingCount = await this.sensorReadingRepo.count({
        where: { sensor: { id: sensorId } },
      });
      info.readingCount = readingCount;

      const alertCount = await this.alertRepo.count({
        where: { sensor: { id: sensorId } },
      });
      info.alertCount = alertCount;
    } else {
      info.totalDevices = await this.deviceRepo.count();
      info.totalSensors = await this.sensorRepo.count();
      info.totalReadings = await this.sensorReadingRepo.count();
      info.totalAlerts = await this.alertRepo.count();
    }

    return info;
  }

  /**
   * Elimina un sensor (soft delete)
   * 
   * Regla funcional:
   * ✅ Permitir eliminar si status: draft, pending_claim, pending_confirmation, revoked
   * ✅ Permitir eliminar si sensor está inactivo (isActive: false)
   * ✅ Permitir eliminar si dispositivo está offline
   * ❌ Bloquear si sensor está online/offline activo Y dispositivo online
   */
  async deleteSensor(sensorId: number) {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });

    if (!sensor) {
      throw new NotFoundException('Sensor no encontrado');
    }

    const sensorStatus = (sensor.status || '').toLowerCase();
    const deviceStatus = (sensor.device?.status || '').toLowerCase();
    const deletableStates = ['draft', 'pending_claim', 'pending_confirmation', 'revoked'];

    // Permitir eliminar si:
    // 1. Status del sensor está en estados eliminables
    // 2. Sensor está inactivo
    // 3. Dispositivo está offline
    const canDelete = 
      deletableStates.includes(sensorStatus) ||
      !sensor.isActive ||
      deviceStatus !== 'online';

    if (!canDelete) {
      throw new BadRequestException(
        `No se puede eliminar un sensor en estado "${sensor.status}" mientras el dispositivo está online. ` +
        'Desactive el sensor primero o espere a que el dispositivo esté offline.',
      );
    }

    // Soft delete
    await this.sensorRepo.update(String(sensorId), {
      isActive: false,
      status: 'revoked',
      updatedAt: new Date(),
    });

    return {
      message: `Sensor ${sensor.name || sensorId} eliminado correctamente.`,
    };
  }

  /**
   * INC-05: Obtiene el umbral de delta absoluto desde la tabla delta_thresholds.
   * Retorna null si no hay umbral configurado (fallback: no detectar spikes).
   * 
   * @param sensorId - ID del sensor
   * @returns Umbral absoluto de delta o null
   */
  private async getDeltaThresholdForSensor(sensorId: number): Promise<number | null> {
    try {
      const result = await this.dataSource.query(
        `SELECT TOP 1 abs_delta 
         FROM dbo.delta_thresholds 
         WHERE sensor_id = @0 AND is_active = 1 
         ORDER BY id ASC`,
        [sensorId],
      );
      
      if (result && result.length > 0 && result[0].abs_delta !== null) {
        return Number(result[0].abs_delta);
      }
      return null;
    } catch {
      // Si la tabla no existe o hay error, retornar null (no detectar spikes)
      return null;
    }
  }

  /**
   * Dashboard consolidado de un sensor con lecturas y alertas.
   * Formato esperado por Flutter: { sensorId, metrics, trading, alerts }
   */
  async getSensorDashboard(sensorId: number, range = '6h') {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });
    if (!sensor) {
      throw new NotFoundException('Sensor no encontrado');
    }

    // Configuración de ventana de tiempo
    const windowMap: Record<string, { hours: number; bucketMinutes: number }> = {
      '1h': { hours: 1, bucketMinutes: 5 },
      '6h': { hours: 6, bucketMinutes: 15 },
      '12h': { hours: 12, bucketMinutes: 30 },
      '24h': { hours: 24, bucketMinutes: 60 },
      '7d': { hours: 168, bucketMinutes: 360 },
    };
    const config = windowMap[range] || windowMap['6h'];
    const since = new Date(Date.now() - config.hours * 60 * 60 * 1000);

    // Última lectura
    const latestReading = await this.sensorReadingRepo.findOne({
      where: { sensor: { id: String(sensorId) } },
      order: { timestamp: 'DESC' },
    });

    // Lecturas en el rango
    const readings = await this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('r.timestamp >= :since', { since })
      .orderBy('r.timestamp', 'ASC')
      .getMany();

    // Lectura inicial (antes del rango) para baseline
    const initialReading = await this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('r.timestamp < :since', { since })
      .orderBy('r.timestamp', 'DESC')
      .limit(1)
      .getOne();

    // Umbrales
    const thresholds = await this.thresholdRepo.find({
      where: { sensorId: String(sensorId), isActive: true },
    });

    const warningThreshold = thresholds.find((t) => t.severity === 'warning');
    const alertThreshold = thresholds.find((t) => t.severity === 'critical');

    const canonicalThresholds = {
      warning: {
        min: warningThreshold?.thresholdValueMin ? Number(warningThreshold.thresholdValueMin) : null,
        max: warningThreshold?.thresholdValueMax ? Number(warningThreshold.thresholdValueMax) : null,
      },
      alert: {
        min: alertThreshold?.thresholdValueMin ? Number(alertThreshold.thresholdValueMin) : null,
        max: alertThreshold?.thresholdValueMax ? Number(alertThreshold.thresholdValueMax) : null,
      },
    };

    // Evaluar estado actual basado en umbrales (usando función canónica)
    const currentValue = latestReading ? Number(latestReading.value) : null;
    const state = evaluateTelemetryState(currentValue, {
      warningMin: canonicalThresholds.warning.min,
      warningMax: canonicalThresholds.warning.max,
      alertMin: canonicalThresholds.alert.min,
      alertMax: canonicalThresholds.alert.max,
    });

    // Contar alertas activas
    const activeCritical = await this.alertRepo.count({
      where: { sensor: { id: String(sensorId) }, status: 'active', severity: 'critical' },
    });
    const activeWarning = await this.alertRepo.count({
      where: { sensor: { id: String(sensorId) }, status: 'active', severity: 'warning' },
    });

    // Obtener umbral de delta desde BD (INC-05: evitar hardcoded)
    const deltaThreshold = await this.getDeltaThresholdForSensor(sensorId);

    // Construir series para trading chart
    const series = readings.map((r, idx) => {
      const value = Number(r.value);
      
      // Usar función canónica para evaluar estado (INC-01/INC-03)
      const pointState = evaluateTelemetryState(value, {
        warningMin: canonicalThresholds.warning.min,
        warningMax: canonicalThresholds.warning.max,
        alertMin: canonicalThresholds.alert.min,
        alertMax: canonicalThresholds.alert.max,
      });

      // Calcular delta respecto al punto anterior
      let delta: number | null = null;
      if (idx > 0) {
        const prevValue = Number(readings[idx - 1].value);
        delta = value - prevValue;
      }

      // INC-05: Usar umbral de delta desde BD en lugar de hardcoded
      const events: string[] = [];
      if (delta !== null && deltaThreshold !== null && Math.abs(delta) >= deltaThreshold) {
        events.push('DELTA_SPIKE');
      }

      return {
        timestamp: r.timestamp.toISOString(),
        readingTimestamp: r.timestamp.toISOString(),
        value,
        state: pointState,
        delta,
        events,
      };
    });

    return {
      sensorId: String(sensorId),
      metrics: {
        sensorId: String(sensorId),
        currentValue,
        currentTimestamp: latestReading?.timestamp?.toISOString() ?? null,
        state,
        thresholds: canonicalThresholds,
        prediction: null, // TODO: integrar predicciones ML si existen
      },
      trading: {
        sensorId: String(sensorId),
        range,
        bucketMinutes: config.bucketMinutes,
        initialValue: initialReading ? Number(initialReading.value) : null,
        initialReadingTimestamp: initialReading?.timestamp?.toISOString() ?? null,
        thresholds: canonicalThresholds,
        series,
      },
      alerts: {
        activeCritical,
        activeWarning,
      },
    };
  }

  /**
   * Estado general del sistema de ML para observabilidad.
   */
  async getMlHealth(): Promise<{
    status: string;
    lastRunAt: string;
    sensorsAnalyzed: number;
    sensorsOmitted: number;
    reasonsOmitted: { reason: string; count: number }[];
  }> {
    // Obtener última predicción para saber cuándo corrió el ML
    const lastPrediction = await this.dataSource.query(`
      SELECT TOP 1 predicted_at
      FROM predictions
      ORDER BY predicted_at DESC
    `);
    const lastRunAt = lastPrediction?.[0]?.predicted_at?.toISOString?.() ?? '';

    // Contar sensores activos analizados (con predicciones recientes)
    const sensorsWithPredictions = await this.dataSource.query(`
      SELECT COUNT(DISTINCT sensor_id) as cnt
      FROM predictions
      WHERE predicted_at >= DATEADD(day, -1, GETDATE())
    `);
    const sensorsAnalyzed = Number(sensorsWithPredictions?.[0]?.cnt ?? 0);

    // Contar sensores activos totales
    const totalSensors = await this.dataSource.query(`
      SELECT COUNT(*) as cnt FROM sensors WHERE is_active = 1
    `);
    const totalActive = Number(totalSensors?.[0]?.cnt ?? 0);
    const sensorsOmitted = Math.max(0, totalActive - sensorsAnalyzed);

    // Razones de omisión (simplificado)
    const reasonsOmitted: { reason: string; count: number }[] = [];
    if (sensorsOmitted > 0) {
      // Sensores sin lecturas recientes
      const noRecentReadings = await this.dataSource.query(`
        SELECT COUNT(*) as cnt
        FROM sensors s
        WHERE s.is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM sensor_readings sr
            WHERE sr.sensor_id = s.id
              AND sr.timestamp >= DATEADD(hour, -24, GETDATE())
          )
      `);
      const noDataCount = Number(noRecentReadings?.[0]?.cnt ?? 0);
      if (noDataCount > 0) {
        reasonsOmitted.push({ reason: 'Sin lecturas en 24h', count: noDataCount });
      }
    }

    // Determinar estado
    const isOk = sensorsAnalyzed > 0 && lastRunAt !== '';
    const status = isOk ? 'OK' : 'DEGRADED';

    return {
      status,
      lastRunAt,
      sensorsAnalyzed,
      sensorsOmitted,
      reasonsOmitted,
    };
  }

  /**
   * DIAGNÓSTICO: Datos crudos del sensor SIN agregación.
   * Para gráficas de diagnóstico en tiempo real.
   * 
   * FIX PROBLEMA 5: Retorna TODAS las lecturas sin compresión.
   */
  async getRawSensorReadings(sensorId: number, limit = 500, since?: string) {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });
    if (!sensor) {
      throw new NotFoundException('Sensor no encontrado');
    }

    const qb = this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) });

    // Filtrar por fecha si se proporciona
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        qb.andWhere('r.timestamp >= :since', { since: sinceDate });
      }
    }

    const readings = await qb
      .orderBy('r.timestamp', 'ASC')
      .limit(limit)
      .getMany();

    return {
      sensorId: String(sensorId),
      sensorName: sensor.name,
      deviceName: sensor.device?.name ?? '',
      unit: sensor.unit,
      count: readings.length,
      readings: readings.map((r) => ({
        id: r.id,
        value: Number(r.value),
        timestamp: r.timestamp.toISOString(),
        timestampFormatted: this.formatDateTime(r.timestamp),
      })),
    };
  }

  /**
   * Datos agregados por ventana temporal para gráficas históricas.
   * 
   * FIX PROBLEMA 6: Agregación real por ventana temporal.
   * - 1h: buckets de 1 min (casi crudo)
   * - 6h: buckets de 5 min
   * - 24h: buckets de 1 hora
   * - 7d: buckets diarios
   */
  async getAggregatedSensorReadings(sensorId: number, range = '6h') {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });
    if (!sensor) {
      throw new NotFoundException('Sensor no encontrado');
    }

    // Configuración de ventanas
    const config: Record<string, { hours: number; table: string; bucketLabel: string }> = {
      '1h': { hours: 1, table: 'sensor_readings_1m', bucketLabel: '1 minuto' },
      '6h': { hours: 6, table: 'sensor_readings_5m', bucketLabel: '5 minutos' },
      '24h': { hours: 24, table: 'sensor_readings_1h', bucketLabel: '1 hora' },
      '7d': { hours: 168, table: 'sensor_readings_1h', bucketLabel: '1 hora' },
    };

    const cfg = config[range] || config['6h'];
    const since = new Date(Date.now() - cfg.hours * 60 * 60 * 1000);

    // Intentar leer de tablas agregadas, fallback a raw si no existen
    let aggregatedData: any[] = [];
    try {
      aggregatedData = await this.dataSource.query(
        `SELECT 
           sensor_id,
           bucket_ts,
           avg_value,
           min_value,
           max_value,
           samples
         FROM ${cfg.table} WITH (NOLOCK)
         WHERE sensor_id = @0 AND bucket_ts >= @1
         ORDER BY bucket_ts ASC`,
        [sensorId, since],
      );
    } catch {
      // Tabla no existe, calcular on-the-fly desde raw
      aggregatedData = [];
    }

    // Si no hay datos agregados, calcular desde raw
    if (aggregatedData.length === 0) {
      const bucketMinutes = range === '1h' ? 1 : range === '6h' ? 5 : range === '24h' ? 60 : 60;
      
      const rawAgg = await this.dataSource.query(
        `SELECT 
           sensor_id,
           DATEADD(minute, (DATEDIFF(minute, 0, [timestamp]) / @2) * @2, 0) AS bucket_ts,
           AVG(CAST(value AS FLOAT)) AS avg_value,
           MIN(CAST(value AS FLOAT)) AS min_value,
           MAX(CAST(value AS FLOAT)) AS max_value,
           COUNT(*) AS samples
         FROM sensor_readings WITH (NOLOCK)
         WHERE sensor_id = @0 AND [timestamp] >= @1
         GROUP BY sensor_id, DATEADD(minute, (DATEDIFF(minute, 0, [timestamp]) / @2) * @2, 0)
         ORDER BY bucket_ts ASC`,
        [sensorId, since, bucketMinutes],
      );
      aggregatedData = rawAgg;
    }

    return {
      sensorId: String(sensorId),
      sensorName: sensor.name,
      deviceName: sensor.device?.name ?? '',
      unit: sensor.unit,
      range,
      bucketLabel: cfg.bucketLabel,
      count: aggregatedData.length,
      series: aggregatedData.map((row: any) => ({
        timestamp: row.bucket_ts instanceof Date ? row.bucket_ts.toISOString() : row.bucket_ts,
        avg: Number(row.avg_value),
        min: Number(row.min_value),
        max: Number(row.max_value),
        samples: Number(row.samples),
      })),
    };
  }

  /**
   * Ejecuta el mantenimiento de alertas manualmente.
   * Llama a los SPs de auto-resolución y limpieza por TTL.
   */
  async runAlertMaintenance() {
    const results: any = {
      autoResolved: 0,
      ttlCleaned: 0,
      mlEventsCleaned: 0,
      errors: [] as string[],
    };

    try {
      const r1 = await this.dataSource.query('EXEC sp_auto_resolve_alerts');
      results.autoResolved = r1?.[0]?.resolved_count ?? 0;
    } catch (e) {
      results.errors.push(`sp_auto_resolve_alerts: ${(e as Error).message}`);
    }

    try {
      const r2 = await this.dataSource.query('EXEC sp_cleanup_stale_alerts @ttl_minutes = 60');
      results.ttlCleaned = r2?.[0]?.cleaned_count ?? 0;
    } catch (e) {
      results.errors.push(`sp_cleanup_stale_alerts: ${(e as Error).message}`);
    }

    try {
      const r3 = await this.dataSource.query('EXEC sp_cleanup_stale_ml_events @ttl_minutes = 30');
      results.mlEventsCleaned = r3?.[0]?.cleaned_count ?? 0;
    } catch (e) {
      results.errors.push(`sp_cleanup_stale_ml_events: ${(e as Error).message}`);
    }

    return {
      success: results.errors.length === 0,
      ...results,
      executedAt: new Date().toISOString(),
    };
  }
}
