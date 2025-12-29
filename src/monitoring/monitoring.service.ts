import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  AlertsHistoryView,
  LatestSensorReadingView,
  MlEventActiveView,
} from '../entities/views';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MonitoringService {
  // repositorios principales para leer datos del sistema iot
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
    @InjectRepository(AlertsHistoryView)
    private readonly alertsHistoryViewRepo: Repository<AlertsHistoryView>,
    @InjectRepository(LatestSensorReadingView)
    private readonly latestSensorReadingViewRepo: Repository<LatestSensorReadingView>,
    @InjectRepository(MlEventActiveView)
    private readonly mlEventActiveViewRepo: Repository<MlEventActiveView>,
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
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

  // convierte fechas a un texto sencillo para mostrar en el dashboard
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
   *
   * Importante: usamos un SELECT directo con WITH (NOLOCK) para evitar que el
   * polling en tiempo real bloquee la ingesta (READ UNCOMMITTED).
   */
  async getLatestSensorReadings() {
    const rows = await this.dataSource.query(
      `
      SELECT
        lr.sensor_id      AS sensorId,
        lr.sensor_uuid    AS sensorUuid,
        lr.sensor_name    AS sensorName,
        lr.sensor_type    AS sensorType,
        lr.unit           AS unit,
        lr.device_name    AS deviceName,
        lr.latest_value   AS latestValue,
        lr.latest_timestamp AS latestTimestamp
      FROM v_latest_sensor_readings lr WITH (NOLOCK)
      `,
    );

    return (rows ?? []).map((row: any) => ({
      ...row,
      latestTimestamp: this.formatDateTime(row.latestTimestamp ?? null),
    }));
  }

  /**
   * Devuelve alertas activas/acknowledged.
   *
   * Nota: usamos v_alerts_history (en vez de v_active_alerts) para incluir sensorId
   * y permitir navegación directa al detalle del sensor desde el frontend.
   */
  async getActiveAlerts(limit = 100) {
    const rows = await this.alertsHistoryViewRepo
      .createQueryBuilder('a')
      .where('a.status IN (:...st)', { st: ['active', 'acknowledged'] })
      .orderBy('a.triggeredAt', 'DESC')
      .limit(limit)
      .getMany();

    return rows.map((row) => ({
      alertId: row.alertId,
      sensorId: row.sensorId,
      severity: row.severity,
      status: row.status,
      triggeredValue: row.triggeredValue,
      triggeredAt: this.formatDateTime(row.triggeredAt ?? null),
      deviceName: row.deviceName,
      deviceUuid: row.deviceUuid,
      sensorName: row.sensorName,
      sensorType: row.sensorType,
      unit: row.unit,
      thresholdName: row.thresholdName,
      conditionType: row.conditionType,
      thresholdValueMin: row.thresholdValueMin,
      thresholdValueMax: row.thresholdValueMax,
    }));
  }

  /**
   * Historial de alertas (por sensor).
   */
  async getSensorAlertsHistory(sensorId: number, limit = 50) {
    const rows = await this.alertsHistoryViewRepo
      .createQueryBuilder('a')
      .where('a.sensorId = :sensorId', { sensorId: String(sensorId) })
      .orderBy('a.triggeredAt', 'DESC')
      .limit(limit)
      .getMany();

    return rows.map((row) => ({
      alertId: row.alertId,
      sensorId: row.sensorId,
      severity: row.severity,
      status: row.status,
      triggeredValue: row.triggeredValue,
      triggeredAt: this.formatDateTime(row.triggeredAt ?? null),
      thresholdName: row.thresholdName,
      conditionType: row.conditionType,
      thresholdValueMin: row.thresholdValueMin,
      thresholdValueMax: row.thresholdValueMax,
      acknowledgedAt: this.formatDateTime(row.acknowledgedAt ?? null),
      acknowledgedByUsername: row.acknowledgedByUsername,
      resolvedAt: this.formatDateTime(row.resolvedAt ?? null),
      resolvedByUsername: row.resolvedByUsername,
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
   */
  async getLatestPredictions(limit = 50) {
    const rows = await this.predictionRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.model', 'model')
      .leftJoinAndSelect('p.sensor', 'sensor')
      .leftJoinAndSelect('sensor.device', 'device')
      .orderBy('p.targetTimestamp', 'ASC')
      .limit(limit)
      .getMany();

    return rows.map((p) => ({
      id: p.id,
      predictedValue: p.predictedValue,
      confidence: p.confidence,
      predictedAt: this.formatDateTime(p.predictedAt),
      targetTimestamp: this.formatDateTime(p.targetTimestamp),
      sensorName: p.sensor.name,
      unit: p.sensor.unit,
      deviceName: p.sensor.device?.name ?? '',
      modelName: p.model.modelName,
      modelVersion: p.model.version,
    }));
  }

  /**
   * Inserta una lectura para un sensor usando el SP sp_insert_reading_and_check_threshold
   * Esto también evaluará los umbrales y generará alertas si corresponde.
   */
  async insertSensorReading(sensorId: number, value: number) {
    // Ejecutamos el SP que inserta la lectura y genera alertas si corresponde.
    const result = await this.dataSource.query(
      'EXEC sp_insert_reading_and_check_threshold @p_sensor_id = ?, @p_value = ?',
      [sensorId, value],
    );

    // Si el SP devuelve el id de alerta creada, intenta enviar push.
    // Ajusta esto según el contrato real de tu SP (a veces devuelve un recordset).
    try {
      if (Array.isArray(result) && result.length > 0) {
        const maybeRow = result[0];
        const alertId = maybeRow?.alert_id ?? maybeRow?.alertId ?? maybeRow?.id;
        if (alertId) {
          await this.notificationsService.sendAlertNotification(String(alertId));
        }
      }
    } catch (e) {
      // Nunca rompemos la ingesta por un fallo de notificación.
      // Solo dejamos log para debug.
      // eslint-disable-next-line no-console
      console.error('Error sending alert push notification', e);
    }
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
    // Regla de producto: 1 límite activo por sensor.
    const existing = await this.thresholdRepo.findOne({
      where: {
        sensorId: String(sensorId),
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Este sensor ya tiene un límite activo. Edita el existente en lugar de crear uno nuevo.',
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
   * Actualiza un threshold y guarda historial ANTES de sobrescribir.
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

    // Nuevo payload propuesto (si no viene, mantenemos el actual)
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

    // historial: min/max no cambian, pero queda auditado el evento
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
}
