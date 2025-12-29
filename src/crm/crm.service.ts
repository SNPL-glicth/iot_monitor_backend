import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Alert } from '../entities/alert.entity';
import { DeviceLocation } from '../entities/device-location.entity';
import { Sensor } from '../entities/sensor.entity';
import {
  AlertsHistoryView,
  DeviceProfileSummaryView,
  DeviceTimelineView,
  MlEventActiveView,
} from '../entities/views';

type AuthCtx = { userId: string; role?: 'admin' | 'operator' | 'viewer' };

type PageQuery = { page: number; pageSize: number };

type DeviceListQuery = PageQuery & {
  q?: string;
  status?: string;
  type?: string;
};

type TimelineQuery = PageQuery & { from?: string; to?: string };

type AlertsQuery = PageQuery & {
  status?: string;
  severity?: string;
  deviceId?: string;
  sensorId?: string;
  from?: string;
  to?: string;
};

type SeriesQuery = {
  from: string;
  to: string;
  bucket?: '1m' | '5m' | '1h';
  maxPoints: number;
};

type DeviceHistoryQuery = {
  from?: string;
  to?: string;
  bucket?: '1m' | '5m' | '1h';
  maxPoints: number;
  sensorIds?: string; // comma-separated
  maxSensors: number;
};

type DeviceProfileFullQuery = DeviceHistoryQuery & {
  alertsLimit: number;
};

type DashboardQuery = {
  from?: string;
  to?: string;
  alertsLimit: number;
  eventsLimit: number;
  topDevicesLimit: number;
};

type MlEventsQuery = PageQuery & {
  deviceId?: string;
  sensorId?: string;
  eventType?: string; // 'critical' | 'warning' | 'notice'
  eventCode?: string; // 'PRED_THRESHOLD_BREACH' | 'ANOMALY_DETECTED' | ...
  from?: string;
  to?: string;
};

@Injectable()
export class CrmService {
  constructor(
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(DeviceLocation)
    private readonly locationRepo: Repository<DeviceLocation>,
    @InjectRepository(DeviceProfileSummaryView)
    private readonly deviceSummaryRepo: Repository<DeviceProfileSummaryView>,
    @InjectRepository(AlertsHistoryView)
    private readonly alertsHistoryRepo: Repository<AlertsHistoryView>,
    @InjectRepository(DeviceTimelineView)
    private readonly timelineRepo: Repository<DeviceTimelineView>,
    @InjectRepository(MlEventActiveView)
    private readonly mlEventActiveRepo: Repository<MlEventActiveView>,
    private readonly dataSource: DataSource,
  ) {}

  private clampPageSize(n: number, max = 200): number {
    if (!Number.isFinite(n) || n <= 0) return 50;
    return Math.min(Math.floor(n), max);
  }

  private isAdmin(ctx: AuthCtx): boolean {
    return ctx.role === 'admin';
  }

  private requireUserId(ctx: AuthCtx) {
    if (!ctx.userId) throw new ForbiddenException('Usuario inválido');
  }

  private async assertDeviceReadAccess(deviceId: number, ctx: AuthCtx) {
    // Nuevo criterio: todos los roles pueden ver todos los dispositivos.
    // Solo validamos existencia.
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 d.id AS id
      FROM devices d
      WHERE d.id = @0
      `,
      [deviceId],
    );

    if (!rows || rows.length === 0) {
      throw new NotFoundException('Dispositivo no encontrado');
    }
  }

  private async assertDeviceWriteAccess(deviceId: number, ctx: AuthCtx) {
    // Nuevo criterio: admin + operator pueden modificar (viewer no).
    if (ctx.role !== 'admin' && ctx.role !== 'operator') {
      throw new ForbiddenException('Sin permisos de escritura');
    }

    // Validar que el dispositivo exista.
    await this.assertDeviceReadAccess(deviceId, ctx);
  }

  async listDevices(query: DeviceListQuery, ctx: AuthCtx) {
    // Nuevo criterio: todos los roles ven TODOS los dispositivos.
    // Implementación: SQL directo contra tabla devices (source of truth), calculando KPIs básicos.
    const page = Math.max(1, Math.floor(query.page || 1));
    const pageSize = this.clampPageSize(query.pageSize || 20, 200);

    const where: string[] = [];
    const params: any[] = [];

    if (query.status) {
      where.push(`d.status = @${params.length}`);
      params.push(query.status);
    }

    if (query.type) {
      where.push(`d.device_type = @${params.length}`);
      params.push(query.type);
    }

    if (query.q) {
      where.push(
        `(d.name LIKE @${params.length} OR CAST(d.device_uuid AS nvarchar(36)) LIKE @${params.length})`,
      );
      params.push(`%${query.q}%`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await this.dataSource.query(
      `
      SELECT COUNT(1) AS total
      FROM devices d
      ${whereSql}
      `,
      params,
    );

    const total = Number(countRows?.[0]?.total ?? 0);

    const offset = (page - 1) * pageSize;
    const offsetIx = params.length;
    const nextIx = params.length + 1;

    const rows = await this.dataSource.query(
      `
      SELECT
        d.id AS deviceId,
        d.device_uuid AS deviceUuid,
        d.name AS deviceName,
        d.device_type AS deviceType,
        d.status,
        d.last_connection AS lastConnection,
        (
          SELECT COUNT(1)
          FROM sensors s
          WHERE s.device_id = d.id
        ) AS sensorCount,
        (
          SELECT COUNT(1)
          FROM alerts a
          WHERE a.device_id = d.id
            AND a.status IN ('active', 'acknowledged')
        ) AS activeAlerts,
        (
          SELECT MAX(a.triggered_at)
          FROM alerts a
          WHERE a.device_id = d.id
        ) AS lastAlertAt
      FROM devices d
      ${whereSql}
      ORDER BY d.last_connection DESC, d.name ASC
      OFFSET @${offsetIx} ROWS FETCH NEXT @${nextIx} ROWS ONLY
      `,
      [...params, offset, pageSize],
    );

    return {
      page,
      pageSize,
      total,
      items: (rows ?? []).map((r: any) => ({
        deviceId: String(r.deviceId),
        deviceUuid: r.deviceUuid,
        deviceName: r.deviceName,
        deviceType: r.deviceType,
        status: r.status,
        lastConnection: r.lastConnection instanceof Date ? r.lastConnection.toISOString() : r.lastConnection,
        sensorCount: Number(r.sensorCount ?? 0),
        activeAlerts: Number(r.activeAlerts ?? 0),
        lastAlertAt: r.lastAlertAt instanceof Date ? r.lastAlertAt.toISOString() : r.lastAlertAt,
      })),
    };
  }

  async getDeviceProfile(deviceId: number, ctx: AuthCtx) {
    await this.assertDeviceReadAccess(deviceId, ctx);
    const id = String(deviceId);

    let summary = await this.deviceSummaryRepo.findOne({
      where: { deviceId: id },
    });

    // Fallback: si la vista no tiene fila (ej: device sin sensores/lecturas), armamos summary desde devices.
    if (!summary) {
      const rows = await this.dataSource.query(
        `
        SELECT
          d.id AS deviceId,
          d.device_uuid AS deviceUuid,
          d.name AS deviceName,
          d.device_type AS deviceType,
          d.status,
          d.last_connection AS lastConnection,
          (
            SELECT COUNT(1)
            FROM sensors s
            WHERE s.device_id = d.id
          ) AS sensorCount,
          (
            SELECT COUNT(1)
            FROM alerts a
            WHERE a.device_id = d.id
              AND a.status IN ('active', 'acknowledged')
          ) AS activeAlerts,
          (
            SELECT MAX(a.triggered_at)
            FROM alerts a
            WHERE a.device_id = d.id
          ) AS lastAlertAt
        FROM devices d
        WHERE d.id = @0
        `,
        [deviceId],
      );

      const r = rows?.[0];
      if (!r) {
        throw new NotFoundException('Dispositivo no encontrado');
      }

      summary = {
        deviceId: String(r.deviceId),
        deviceUuid: r.deviceUuid,
        deviceName: r.deviceName,
        deviceType: r.deviceType,
        status: r.status,
        lastConnection:
          r.lastConnection instanceof Date
            ? r.lastConnection.toISOString()
            : r.lastConnection,
        sensorCount: Number(r.sensorCount ?? 0),
        activeAlerts: Number(r.activeAlerts ?? 0),
        lastAlertAt:
          r.lastAlertAt instanceof Date ? r.lastAlertAt.toISOString() : r.lastAlertAt,
      } as any;
    }

    const sensors = await this.sensorRepo.find({
      where: { device: { id } as any },
      order: { id: 'ASC' },
      relations: ['device'],
    });

    // Latest readings for this device (from existing view)
    const latestReadings = await this.dataSource.query(
      `
      SELECT lr.sensor_id AS sensorId,
             lr.sensor_uuid AS sensorUuid,
             lr.sensor_name AS sensorName,
             lr.sensor_type AS sensorType,
             lr.unit,
             lr.latest_value AS latestValue,
             lr.latest_timestamp AS latestTimestamp
      FROM v_latest_sensor_readings lr
      JOIN sensors s ON s.id = lr.sensor_id
      WHERE s.device_id = @0
      `,
      [deviceId],
    );

    // Active/ack alerts for this device (CRM history view)
    const activeAlerts = await this.dataSource.query(
      `
      SELECT *
      FROM v_alerts_history
      WHERE device_id = @0
        AND status IN ('active', 'acknowledged')
      ORDER BY triggered_at DESC
      `,
      [deviceId],
    );

    const lastLocation = await this.locationRepo.findOne({
      where: { device: { id } as any },
      order: { timestamp: 'DESC' },
    });

    return {
      summary,
      sensors,
      latestReadings: latestReadings.map((r: any) => ({
        ...r,
        latestTimestamp:
          r.latestTimestamp instanceof Date
            ? r.latestTimestamp.toISOString()
            : r.latestTimestamp,
      })),
      activeAlerts,
      lastLocation,
    };
  }

  private sanitizeTimelineEventForRole(event: any, ctx: AuthCtx) {
    // Nota: `payload` puede contener detalles sensibles (comandos, ubicaciones, etc.).
    // - Admin/operator: ven payload completo.
    // - Viewer: payload se omite (null) para evitar filtración de detalles operativos.
    const payload = ctx.role === 'viewer' ? null : event.payload;

    return {
      ...event,
      occurredAt:
        event.occurredAt instanceof Date
          ? event.occurredAt.toISOString()
          : event.occurredAt,
      payload,
    };
  }

  async getDeviceTimeline(deviceId: number, query: TimelineQuery, ctx: AuthCtx) {
    await this.assertDeviceReadAccess(deviceId, ctx);
    const page = Math.max(1, Math.floor(query.page || 1));
    const pageSize = this.clampPageSize(query.pageSize || 50, 200);

    const qb = this.timelineRepo
      .createQueryBuilder('t')
      .where('t.deviceId = :deviceId', { deviceId: String(deviceId) })
      .orderBy('t.occurredAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.from) {
      qb.andWhere('t.occurredAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('t.occurredAt <= :to', { to: new Date(query.to) });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      page,
      pageSize,
      total,
      items: items.map((e) => this.sanitizeTimelineEventForRole(e, ctx)),
    };
  }

  async listAlerts(query: AlertsQuery, ctx: AuthCtx) {
    const page = Math.max(1, Math.floor(query.page || 1));
    const pageSize = this.clampPageSize(query.pageSize || 50, 200);

    const qb = this.alertsHistoryRepo
      .createQueryBuilder('a')
      .orderBy('a.triggeredAt', 'DESC');

    // Nuevo criterio: todos los roles ven todas las alertas.
    // (Viewer sigue con payload recortado en timeline.)

    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    if (query.severity)
      qb.andWhere('a.severity = :severity', { severity: query.severity });
    if (query.deviceId)
      qb.andWhere('a.deviceId = :deviceId', { deviceId: String(query.deviceId) });
    if (query.sensorId)
      qb.andWhere('a.sensorId = :sensorId', { sensorId: String(query.sensorId) });

    if (query.from) qb.andWhere('a.triggeredAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('a.triggeredAt <= :to', { to: new Date(query.to) });

    const [items, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { page, pageSize, total, items };
  }

  async acknowledgeAlert(alertId: number, ctx: AuthCtx) {
    this.requireUserId(ctx);

    const row = await this.alertRepo.findOne({ where: { id: String(alertId) } });
    if (!row) throw new NotFoundException('Alerta no encontrada');

    await this.assertDeviceWriteAccess(Number(row.deviceId), ctx);

    if (row.status === 'resolved') {
      return { success: true, status: row.status };
    }

    row.status = 'acknowledged';
    row.acknowledgedAt = new Date();
    row.acknowledgedById = ctx.userId;

    await this.alertRepo.save(row);
    return { success: true };
  }

  async resolveAlert(alertId: number, ctx: AuthCtx) {
    this.requireUserId(ctx);

    const row = await this.alertRepo.findOne({ where: { id: String(alertId) } });
    if (!row) throw new NotFoundException('Alerta no encontrada');

    await this.assertDeviceWriteAccess(Number(row.deviceId), ctx);

    if (!row.acknowledgedAt) {
      row.acknowledgedAt = new Date();
      row.acknowledgedById = ctx.userId;
    }

    row.status = 'resolved';
    row.resolvedAt = new Date();
    row.resolvedById = ctx.userId;

    await this.alertRepo.save(row);
    return { success: true };
  }

  private chooseBucket(from: Date, to: Date, maxPoints: number): '1m' | '5m' | '1h' {
    const rangeMs = to.getTime() - from.getTime();
    if (rangeMs <= 0) return '1m';

    // Preferencia base
    let bucket: '1m' | '5m' | '1h' =
      rangeMs <= 24 * 60 * 60 * 1000
        ? '1m'
        : rangeMs <= 30 * 24 * 60 * 60 * 1000
          ? '5m'
          : '1h';

    const stepMs = (b: typeof bucket) =>
      b === '1m' ? 60_000 : b === '5m' ? 300_000 : 3_600_000;
    const next = (b: typeof bucket) => (b === '1m' ? '5m' : b === '5m' ? '1h' : '1h');

    while (
      Math.ceil(rangeMs / stepMs(bucket)) > Math.max(50, maxPoints) &&
      bucket !== '1h'
    ) {
      bucket = next(bucket);
    }

    return bucket;
  }

  private parseDateOrThrow(label: string, value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${label} inválido (usa ISO 8601)`);
    }
    return d;
  }

  private parseSensorIds(sensorIds?: string): string[] {
    if (!sensorIds) return [];
    return sensorIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => String(Number(s)))
      .filter((s) => s !== 'NaN');
  }

  private async resolveDeviceSensors(args: {
    deviceId: number;
    sensorIds?: string;
    maxSensors: number;
    onlyActive?: boolean;
  }): Promise<Sensor[]> {
    const requestedSensorIds = this.parseSensorIds(args.sensorIds);
    const maxSensors = this.clampPageSize(args.maxSensors || 6, 50);

    const qb = this.sensorRepo
      .createQueryBuilder('s')
      .leftJoin('s.device', 'd')
      .where('d.id = :deviceId', { deviceId: String(args.deviceId) })
      .orderBy('s.id', 'ASC');

    if (args.onlyActive ?? true) {
      qb.andWhere('s.isActive = 1');
    }

    if (requestedSensorIds.length > 0) {
      qb.andWhere('s.id IN (:...sensorIds)', { sensorIds: requestedSensorIds });
    }

    return qb.take(maxSensors).getMany();
  }

  private async getAggregatedPoints(args: {
    sensorIds: number[];
    from: Date;
    to: Date;
    bucket: '1m' | '5m' | '1h';
  }): Promise<Map<string, any[]>> {
    if (args.sensorIds.length === 0) return new Map();

    const table =
      args.bucket === '1m'
        ? 'sensor_readings_1m'
        : args.bucket === '5m'
          ? 'sensor_readings_5m'
          : 'sensor_readings_1h';

    // TypeORM + SQL Server usan placeholders @0, @1, ... (no '?').
    const inList = args.sensorIds.map((_, i) => `@${i}`).join(',');
    const fromIx = args.sensorIds.length;
    const toIx = args.sensorIds.length + 1;

    const rows = await this.dataSource.query(
      `
      SELECT
        sensor_id AS sensorId,
        bucket_ts AS ts,
        avg_value AS avg,
        min_value AS min,
        max_value AS max,
        last_value AS last,
        samples
      FROM ${table}
      WHERE sensor_id IN (${inList})
        AND bucket_ts >= @${fromIx}
        AND bucket_ts <= @${toIx}
      ORDER BY sensor_id ASC, bucket_ts ASC
      `,
      [...args.sensorIds, args.from, args.to],
    );

    const pointsBySensor = new Map<string, any[]>();
    for (const r of rows) {
      const sid = String(r.sensorId);
      const list = pointsBySensor.get(sid) ?? [];
      list.push({
        ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts,
        avg: Number(r.avg),
        min: Number(r.min),
        max: Number(r.max),
        last: r.last == null ? null : Number(r.last),
        samples: Number(r.samples),
      });
      pointsBySensor.set(sid, list);
    }

    return pointsBySensor;
  }

  async getDeviceHistory(deviceId: number, query: DeviceHistoryQuery, ctx: AuthCtx) {
    await this.assertDeviceReadAccess(deviceId, ctx);
    const now = new Date();
    const to = query.to ? this.parseDateOrThrow('to', query.to) : now;
    const from = query.from
      ? this.parseDateOrThrow('from', query.from)
      : new Date(to.getTime() - 24 * 60 * 60 * 1000);

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from debe ser <= to');
    }

    const maxPoints = this.clampPageSize(query.maxPoints || 400, 2000);
    const bucket = query.bucket ?? this.chooseBucket(from, to, maxPoints);

    const sensors = await this.resolveDeviceSensors({
      deviceId,
      sensorIds: query.sensorIds,
      maxSensors: query.maxSensors,
      onlyActive: true,
    });

    const requestedSensorIds = this.parseSensorIds(query.sensorIds);
    if (requestedSensorIds.length > 0 && sensors.length === 0) {
      throw new NotFoundException('Sensores no encontrados para este dispositivo');
    }

    if (sensors.length === 0) {
      return {
        deviceId,
        from: from.toISOString(),
        to: to.toISOString(),
        bucket,
        sensors: [],
        kpis: { alerts24h: {}, alerts7d: {} },
      };
    }

    const sensorIdNums = sensors.map((s) => Number(s.id)).filter(Number.isFinite);
    const pointsBySensor = await this.getAggregatedPoints({
      sensorIds: sensorIdNums,
      from,
      to,
      bucket,
    });

    // KPIs: alertas por severidad (24h y 7d)
    const since24h = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    const alerts24h = await this.dataSource.query(
      `
      SELECT a.severity, COUNT(1) AS cnt
      FROM alerts a
      WHERE a.device_id = @0
        AND a.triggered_at >= @1
        AND a.triggered_at <= @2
      GROUP BY a.severity
      `,
      [deviceId, since24h, to],
    );

    const alerts7d = await this.dataSource.query(
      `
      SELECT a.severity, COUNT(1) AS cnt
      FROM alerts a
      WHERE a.device_id = @0
        AND a.triggered_at >= @1
        AND a.triggered_at <= @2
      GROUP BY a.severity
      `,
      [deviceId, since7d, to],
    );

    const toMap = (arr: any[]) =>
      arr.reduce((acc, x) => {
        acc[String(x.severity)] = Number(x.cnt);
        return acc;
      }, {} as Record<string, number>);

    return {
      deviceId,
      from: from.toISOString(),
      to: to.toISOString(),
      bucket,
      sensors: sensors.map((s) => ({
        id: s.id,
        name: s.name,
        sensorType: s.sensorType,
        unit: s.unit,
        points: pointsBySensor.get(String(s.id)) ?? [],
      })),
      kpis: {
        alerts24h: toMap(alerts24h),
        alerts7d: toMap(alerts7d),
      },
    };
  }

  async getDashboard(query: DashboardQuery, ctx: AuthCtx) {
    // Nuevo criterio: todos los roles pueden ver el dashboard completo.

    const now = new Date();
    const to = query.to ? this.parseDateOrThrow('to', query.to) : now;
    const from = query.from
      ? this.parseDateOrThrow('from', query.from)
      : new Date(to.getTime() - 24 * 60 * 60 * 1000);

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from debe ser <= to');
    }

    const alertsLimit = this.clampPageSize(query.alertsLimit || 50, 200);
    const eventsLimit = this.clampPageSize(query.eventsLimit || 50, 200);
    const topDevicesLimit = this.clampPageSize(query.topDevicesLimit || 10, 100);

    // KPIs: dispositivos por status
    const devicesByStatus = await this.dataSource.query(
      `
      SELECT d.status, COUNT(1) AS cnt
      FROM devices d
      GROUP BY d.status
      `,
      [],
    );

    // KPIs: alertas activas por severidad (estado actual)
    const activeAlertsBySeverity = await this.dataSource.query(
      `
      SELECT a.severity, COUNT(1) AS cnt
      FROM alerts a
      WHERE a.status IN ('active', 'acknowledged')
      GROUP BY a.severity
      `,
      [],
    );

    // Top devices por # alertas activas
    const topDevicesByActiveAlerts = await this.dataSource.query(
      `
      SELECT TOP (${topDevicesLimit})
        a.device_id AS deviceId,
        d.device_uuid AS deviceUuid,
        d.name AS deviceName,
        COUNT(1) AS activeAlerts
      FROM alerts a
      JOIN devices d ON d.id = a.device_id
      WHERE a.status IN ('active', 'acknowledged')
      GROUP BY a.device_id, d.device_uuid, d.name
      ORDER BY COUNT(1) DESC, d.name ASC
      `,
      [],
    );

    // Alert queue: últimas alertas activas/ack (filtrado por rango opcional)
    const alertQueue = await this.dataSource.query(
      `
      SELECT TOP (${alertsLimit}) *
      FROM v_alerts_history
      WHERE status IN ('active', 'acknowledged')
        AND triggered_at >= @0
        AND triggered_at <= @1
      ORDER BY triggered_at DESC
      `,
      [from, to],
    );

    // Timeline global: últimos eventos (filtrado por rango)
    const recentEvents = await this.dataSource.query(
      `
      SELECT TOP (${eventsLimit})
        t.event_type AS eventType,
        t.device_id AS deviceId,
        d.device_uuid AS deviceUuid,
        d.name AS deviceName,
        t.sensor_id AS sensorId,
        t.occurred_at AS occurredAt,
        t.severity,
        t.title,
        t.payload
      FROM v_device_timeline t
      JOIN devices d ON d.id = t.device_id
      WHERE t.occurred_at >= @0
        AND t.occurred_at <= @1
      ORDER BY t.occurred_at DESC
      `,
      [from, to],
    );

    const asMap = (arr: any[], key: string) =>
      arr.reduce((acc, x) => {
        acc[String(x[key])] = Number(x.cnt);
        return acc;
      }, {} as Record<string, number>);

      return {
      from: from.toISOString(),
      to: to.toISOString(),
      kpis: {
        devicesByStatus: asMap(devicesByStatus, 'status'),
        activeAlertsBySeverity: asMap(activeAlertsBySeverity, 'severity'),
      },
      topDevicesByActiveAlerts,
      alertQueue,
      recentEvents: recentEvents.map((e: any) => ({
        ...e,
        occurredAt: e.occurredAt instanceof Date ? e.occurredAt.toISOString() : e.occurredAt,
        payload: ctx.role === 'viewer' ? null : e.payload,
      })),
    };
  }

  async getMlEventsBadge(ctx: AuthCtx) {
    // Por ahora todos los roles ven todos los eventos ML activos.
    const total = await this.mlEventActiveRepo.count();
    return { totalActiveMlEvents: total };
  }

  async listMlEvents(query: MlEventsQuery, ctx: AuthCtx) {
    const page = Math.max(1, Math.floor(query.page || 1));
    const pageSize = this.clampPageSize(query.pageSize || 50, 200);

    const qb = this.mlEventActiveRepo
      .createQueryBuilder('e')
      .orderBy('e.createdAt', 'DESC');

    if (query.deviceId) qb.andWhere('e.deviceId = :deviceId', { deviceId: query.deviceId });
    if (query.sensorId) qb.andWhere('e.sensorId = :sensorId', { sensorId: query.sensorId });
    if (query.eventType) qb.andWhere('e.eventType = :eventType', { eventType: query.eventType });
    if (query.eventCode) qb.andWhere('e.eventCode = :eventCode', { eventCode: query.eventCode });

    if (query.from) qb.andWhere('e.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('e.createdAt <= :to', { to: new Date(query.to) });

    const [items, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      page,
      pageSize,
      total,
      items: items.map((e) => ({
        ...e,
        createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
      })),
    };
  }

  async getDeviceProfileFull(deviceId: number, query: DeviceProfileFullQuery, ctx: AuthCtx) {
    await this.assertDeviceReadAccess(deviceId, ctx);
    const now = new Date();
    const to = query.to ? this.parseDateOrThrow('to', query.to) : now;
    const from = query.from
      ? this.parseDateOrThrow('from', query.from)
      : new Date(to.getTime() - 24 * 60 * 60 * 1000);

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from debe ser <= to');
    }

    const maxPoints = this.clampPageSize(query.maxPoints || 400, 2000);
    const bucket = query.bucket ?? this.chooseBucket(from, to, maxPoints);

    let summary = await this.deviceSummaryRepo.findOne({
      where: { deviceId: String(deviceId) },
    });

    // Fallback: si la vista no tiene fila (ej: device sin sensores/lecturas), armamos summary desde devices.
    if (!summary) {
      const rows = await this.dataSource.query(
        `
        SELECT
          d.id AS deviceId,
          d.device_uuid AS deviceUuid,
          d.name AS deviceName,
          d.device_type AS deviceType,
          d.status,
          d.last_connection AS lastConnection,
          (
            SELECT COUNT(1)
            FROM sensors s
            WHERE s.device_id = d.id
          ) AS sensorCount,
          (
            SELECT COUNT(1)
            FROM alerts a
            WHERE a.device_id = d.id
              AND a.status IN ('active', 'acknowledged')
          ) AS activeAlerts,
          (
            SELECT MAX(a.triggered_at)
            FROM alerts a
            WHERE a.device_id = d.id
          ) AS lastAlertAt
        FROM devices d
        WHERE d.id = @0
        `,
        [deviceId],
      );

      const r = rows?.[0];
      if (!r) {
        throw new NotFoundException('Dispositivo no encontrado');
      }

      summary = {
        deviceId: String(r.deviceId),
        deviceUuid: r.deviceUuid,
        deviceName: r.deviceName,
        deviceType: r.deviceType,
        status: r.status,
        lastConnection:
          r.lastConnection instanceof Date
            ? r.lastConnection.toISOString()
            : r.lastConnection,
        sensorCount: Number(r.sensorCount ?? 0),
        activeAlerts: Number(r.activeAlerts ?? 0),
        lastAlertAt:
          r.lastAlertAt instanceof Date ? r.lastAlertAt.toISOString() : r.lastAlertAt,
      } as any;
    }

    const sensors = await this.resolveDeviceSensors({
      deviceId,
      sensorIds: query.sensorIds,
      maxSensors: query.maxSensors,
      onlyActive: false, // en profile-full puede incluir inactivos si se piden
    });

    const requestedSensorIds = this.parseSensorIds(query.sensorIds);
    if (requestedSensorIds.length > 0 && sensors.length === 0) {
      throw new NotFoundException('Sensores no encontrados para este dispositivo');
    }

    const sensorIdNums = sensors.map((s) => Number(s.id)).filter(Number.isFinite);
    const pointsBySensor = await this.getAggregatedPoints({
      sensorIds: sensorIdNums,
      from,
      to,
      bucket,
    });

    // Latest readings: si hay sensores filtrados, limitamos el resultado
    const latestReadings = await this.dataSource.query(
      sensors.length > 0
        ? `
          SELECT lr.sensor_id AS sensorId,
                 lr.sensor_uuid AS sensorUuid,
                 lr.sensor_name AS sensorName,
                 lr.sensor_type AS sensorType,
                 lr.unit,
                 lr.latest_value AS latestValue,
                 lr.latest_timestamp AS latestTimestamp
          FROM v_latest_sensor_readings lr
          WHERE lr.sensor_id IN (${sensorIdNums.map((_, i) => `@${i}`).join(',')})
        `
        : `
          SELECT lr.sensor_id AS sensorId,
                 lr.sensor_uuid AS sensorUuid,
                 lr.sensor_name AS sensorName,
                 lr.sensor_type AS sensorType,
                 lr.unit,
                 lr.latest_value AS latestValue,
                 lr.latest_timestamp AS latestTimestamp
          FROM v_latest_sensor_readings lr
          JOIN sensors s ON s.id = lr.sensor_id
          WHERE s.device_id = @0
        `,
      sensors.length > 0 ? sensorIdNums : [deviceId],
    );

    const alertsLimit = this.clampPageSize(query.alertsLimit || 50, 200);
    const activeAlerts = await this.dataSource.query(
      `
      SELECT TOP (${alertsLimit}) *
      FROM v_alerts_history
      WHERE device_id = @0
        AND status IN ('active', 'acknowledged')
      ORDER BY triggered_at DESC
      `,
      [deviceId],
    );

    const lastLocation = await this.locationRepo.findOne({
      where: { device: { id: String(deviceId) } as any },
      order: { timestamp: 'DESC' },
    });

    // KPIs (24h/7d)
    const since24h = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    const alerts24h = await this.dataSource.query(
      `
      SELECT a.severity, COUNT(1) AS cnt
      FROM alerts a
      WHERE a.device_id = @0
        AND a.triggered_at >= @1
        AND a.triggered_at <= @2
      GROUP BY a.severity
      `,
      [deviceId, since24h, to],
    );

    const alerts7d = await this.dataSource.query(
      `
      SELECT a.severity, COUNT(1) AS cnt
      FROM alerts a
      WHERE a.device_id = @0
        AND a.triggered_at >= @1
        AND a.triggered_at <= @2
      GROUP BY a.severity
      `,
      [deviceId, since7d, to],
    );

    const toMap = (arr: any[]) =>
      arr.reduce((acc, x) => {
        acc[String(x.severity)] = Number(x.cnt);
        return acc;
      }, {} as Record<string, number>);

    return {
      deviceId,
      summary,
      from: from.toISOString(),
      to: to.toISOString(),
      bucket,
      sensors: sensors.map((s) => ({
        id: s.id,
        name: s.name,
        sensorType: s.sensorType,
        unit: s.unit,
        isActive: s.isActive,
        points: pointsBySensor.get(String(s.id)) ?? [],
      })),
      latestReadings: latestReadings.map((r: any) => ({
        ...r,
        latestTimestamp:
          r.latestTimestamp instanceof Date
            ? r.latestTimestamp.toISOString()
            : r.latestTimestamp,
      })),
      activeAlerts,
      lastLocation,
      kpis: {
        alerts24h: toMap(alerts24h),
        alerts7d: toMap(alerts7d),
      },
    };
  }

  async getSensorSeries(sensorId: number, query: SeriesQuery, ctx: AuthCtx) {
    // Nuevo criterio: todos los roles pueden ver series.
    // (viewer sigue sin ver payload sensible en timeline, pero series no incluyen payload.)
    if (!query.from || !query.to) {
      throw new BadRequestException('from y to son obligatorios');
    }

    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('from/to inválidos (usa ISO 8601)');
    }

    const maxPoints = this.clampPageSize(query.maxPoints || 400, 2000);
    const bucket = query.bucket ?? this.chooseBucket(from, to, maxPoints);

    const table =
      bucket === '1m'
        ? 'sensor_readings_1m'
        : bucket === '5m'
          ? 'sensor_readings_5m'
          : 'sensor_readings_1h';

    const rows = await this.dataSource.query(
      `
      SELECT
        bucket_ts AS ts,
        avg_value AS avg,
        min_value AS min,
        max_value AS max,
        last_value AS last,
        samples
      FROM ${table}
      WHERE sensor_id = @0
        AND bucket_ts >= @1
        AND bucket_ts <= @2
      ORDER BY bucket_ts ASC
      `,
      [sensorId, from, to],
    );

    return {
      sensorId,
      from: from.toISOString(),
      to: to.toISOString(),
      bucket,
      points: rows.map((r: any) => ({
        ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts,
        avg: Number(r.avg),
        min: Number(r.min),
        max: Number(r.max),
        last: r.last == null ? null : Number(r.last),
        samples: Number(r.samples),
      })),
    };
  }
}
