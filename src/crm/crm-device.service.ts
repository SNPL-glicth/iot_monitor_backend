import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sensor } from '../entities/sensor.entity';
import { DeviceProfileSummaryView, DeviceTimelineView } from '../entities/views';
import {
  AuthCtx, assertDeviceReadAccess, clampPageSize, chooseBucket, parseDateOrThrow,
  parseSensorIds, withReadUncommittedRetry,
} from './crm-base.service';

@Injectable()
export class CrmDeviceService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Sensor) private readonly sensorRepo: Repository<Sensor>,
  ) {}

  async listDevices(query: any, _ctx: AuthCtx) {
    const page = Math.max(1, Math.floor(query.page || 1));
    const pageSize = clampPageSize(query.pageSize || 20, 200);
    const where: string[] = []; const params: any[] = [];
    if (query.status) { where.push(`d.status = @${params.length}`); params.push(query.status); }
    if (query.type) { where.push(`d.device_type = @${params.length}`); params.push(query.type); }
    if (query.q) { where.push(`(d.name LIKE @${params.length} OR CAST(d.device_uuid AS nvarchar(36)) LIKE @${params.length})`); params.push(`%${query.q}%`); }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countRows = await withReadUncommittedRetry(this.dataSource, (m) => m.query(`SELECT COUNT(1) AS total FROM devices d WITH (NOLOCK) ${whereSql}`, params));
    const total = Number(countRows?.[0]?.total ?? 0);
    const offset = (page - 1) * pageSize;
    const rows = await withReadUncommittedRetry(this.dataSource, (m) => m.query(`SELECT d.id AS deviceId, d.device_uuid AS deviceUuid, d.name AS deviceName, d.device_type AS deviceType, d.status, d.last_connection AS lastConnection, (SELECT COUNT(1) FROM sensors s WITH (NOLOCK) WHERE s.device_id = d.id) AS sensorCount, (SELECT COUNT(1) FROM alerts a WITH (NOLOCK) WHERE a.device_id = d.id AND a.status IN ('active','acknowledged')) AS activeAlerts, (SELECT MAX(a.triggered_at) FROM alerts a WITH (NOLOCK) WHERE a.device_id = d.id) AS lastAlertAt FROM devices d WITH (NOLOCK) ${whereSql} ORDER BY d.last_connection DESC, d.name ASC OFFSET @${params.length} ROWS FETCH NEXT @${params.length + 1} ROWS ONLY`, [...params, offset, pageSize]));
    return { page, pageSize, total, items: (rows ?? []).map((r: any) => ({ deviceId: String(r.deviceId), deviceUuid: r.deviceUuid, deviceName: r.deviceName, deviceType: r.deviceType, status: r.status, lastConnection: r.lastConnection instanceof Date ? r.lastConnection.toISOString() : r.lastConnection, sensorCount: Number(r.sensorCount ?? 0), activeAlerts: Number(r.activeAlerts ?? 0), lastAlertAt: r.lastAlertAt instanceof Date ? r.lastAlertAt.toISOString() : r.lastAlertAt })) };
  }

  async getDeviceProfile(deviceId: number, ctx: AuthCtx) {
    await assertDeviceReadAccess(this.dataSource, deviceId, ctx);
    return withReadUncommittedRetry(this.dataSource, async (m) => {
      let summary = await m.getRepository(DeviceProfileSummaryView).findOne({ where: { deviceId: String(deviceId) } });
      if (!summary) {
        const rows = await m.query(`SELECT d.id AS deviceId, d.device_uuid AS deviceUuid, d.name AS deviceName, d.device_type AS deviceType, d.status, d.last_connection AS lastConnection, (SELECT COUNT(1) FROM sensors s WITH (NOLOCK) WHERE s.device_id = d.id) AS sensorCount, (SELECT COUNT(1) FROM alerts a WITH (NOLOCK) WHERE a.device_id = d.id AND a.status IN ('active','acknowledged')) AS activeAlerts, (SELECT MAX(a.triggered_at) FROM alerts a WITH (NOLOCK) WHERE a.device_id = d.id) AS lastAlertAt FROM devices d WITH (NOLOCK) WHERE d.id = @0`, [deviceId]);
        const r = rows?.[0]; if (!r) throw new NotFoundException('Dispositivo no encontrado');
        summary = { deviceId: String(r.deviceId), deviceUuid: r.deviceUuid, deviceName: r.deviceName, deviceType: r.deviceType, status: r.status, lastConnection: r.lastConnection instanceof Date ? r.lastConnection.toISOString() : r.lastConnection, sensorCount: Number(r.sensorCount ?? 0), activeAlerts: Number(r.activeAlerts ?? 0), lastAlertAt: r.lastAlertAt instanceof Date ? r.lastAlertAt.toISOString() : r.lastAlertAt } as any;
      }
      const sensors = await m.getRepository(Sensor).find({ where: { device: { id: String(deviceId) } as any }, order: { id: 'ASC' }, relations: ['device'] });
      const latestReadings = await m.query(`SELECT lr.sensor_id AS sensorId, lr.sensor_uuid AS sensorUuid, lr.sensor_name AS sensorName, lr.sensor_type AS sensorType, lr.unit, lr.latest_value AS latestValue, lr.latest_timestamp AS latestTimestamp FROM v_latest_sensor_readings lr WITH (NOLOCK) JOIN sensors s WITH (NOLOCK) ON s.id = lr.sensor_id WHERE s.device_id = @0`, [deviceId]);
      const activeAlerts = await m.query(`SELECT * FROM v_alerts_history WITH (NOLOCK) WHERE device_id = @0 AND status IN ('active','acknowledged') ORDER BY triggered_at DESC`, [deviceId]);
      return { summary, sensors, latestReadings: (latestReadings ?? []).map((r: any) => ({ ...r, latestTimestamp: r.latestTimestamp instanceof Date ? r.latestTimestamp.toISOString() : r.latestTimestamp })), activeAlerts };
    });
  }

  async getDeviceTimeline(deviceId: number, query: any, ctx: AuthCtx) {
    await assertDeviceReadAccess(this.dataSource, deviceId, ctx);
    const page = Math.max(1, Math.floor(query.page || 1)); const pageSize = clampPageSize(query.pageSize || 50, 200);
    return withReadUncommittedRetry(this.dataSource, async (m) => {
      const qb = m.getRepository(DeviceTimelineView).createQueryBuilder('t').setLock('dirty_read').where('t.deviceId = :deviceId', { deviceId: String(deviceId) }).orderBy('t.occurredAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
      if (query.from) qb.andWhere('t.occurredAt >= :from', { from: new Date(query.from) });
      if (query.to) qb.andWhere('t.occurredAt <= :to', { to: new Date(query.to) });
      const [items, total] = await qb.getManyAndCount();
      return { page, pageSize, total, items: items.map((e) => ({ ...e, occurredAt: e.occurredAt instanceof Date ? e.occurredAt.toISOString() : e.occurredAt, payload: ctx.role === 'viewer' ? null : e.payload })) };
    });
  }

  async getDeviceHistory(deviceId: number, query: any, ctx: AuthCtx) {
    await assertDeviceReadAccess(this.dataSource, deviceId, ctx);
    const to = query.to ? parseDateOrThrow('to', query.to) : new Date();
    const from = query.from ? parseDateOrThrow('from', query.from) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const bucket = query.bucket ?? chooseBucket(from, to, clampPageSize(query.maxPoints || 400, 2000));
    const sensors = await this.resolveDeviceSensors({ deviceId, sensorIds: query.sensorIds, maxSensors: query.maxSensors });
    const pointsBySensor = sensors.length ? await this.getAggregatedPoints({ sensorIds: sensors.map((s) => Number(s.id)).filter(Number.isFinite), from, to, bucket }) : new Map();
    return { deviceId, from: from.toISOString(), to: to.toISOString(), bucket, sensors: sensors.map((s) => ({ id: s.id, name: s.name, sensorType: s.sensorType, unit: s.unit, points: pointsBySensor.get(String(s.id)) ?? [] })) };
  }

  async getSensorSeries(sensorId: number, query: any, _ctx: AuthCtx) {
    const from = new Date(query.from); const to = new Date(query.to);
    const bucket = query.bucket ?? chooseBucket(from, to, clampPageSize(query.maxPoints || 400, 2000));
    const table = bucket === '1m' ? 'sensor_readings_1m' : bucket === '5m' ? 'sensor_readings_5m' : 'sensor_readings_1h';
    const rows = await withReadUncommittedRetry(this.dataSource, (m) => m.query(`SELECT bucket_ts AS ts, avg_value AS avg, min_value AS min, max_value AS max, last_value AS last, samples FROM ${table} WITH (NOLOCK) WHERE sensor_id = @0 AND bucket_ts >= @1 AND bucket_ts <= @2 ORDER BY bucket_ts ASC`, [sensorId, from, to]));
    return { sensorId, from: from.toISOString(), to: to.toISOString(), bucket, points: rows.map((r: any) => ({ ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts, avg: Number(r.avg), min: Number(r.min), max: Number(r.max), last: r.last == null ? null : Number(r.last), samples: Number(r.samples) })) };
  }

  private async resolveDeviceSensors(args: { deviceId: number; sensorIds?: string; maxSensors: number; onlyActive?: boolean }): Promise<Sensor[]> {
    const ids = parseSensorIds(args.sensorIds); const max = clampPageSize(args.maxSensors || 6, 50);
    return withReadUncommittedRetry(this.dataSource, async (m) => {
      const qb = m.getRepository(Sensor).createQueryBuilder('s').setLock('dirty_read').leftJoin('s.device', 'd').where('d.id = :deviceId', { deviceId: String(args.deviceId) }).orderBy('s.id', 'ASC');
      if (args.onlyActive ?? true) qb.andWhere('s.isActive = 1');
      if (ids.length > 0) qb.andWhere('s.id IN (:...sensorIds)', { sensorIds: ids });
      return qb.take(max).getMany();
    });
  }

  private async getAggregatedPoints(args: { sensorIds: number[]; from: Date; to: Date; bucket: string }): Promise<Map<string, any[]>> {
    if (args.sensorIds.length === 0) return new Map();
    const table = args.bucket === '1m' ? 'sensor_readings_1m' : args.bucket === '5m' ? 'sensor_readings_5m' : 'sensor_readings_1h';
    const inList = args.sensorIds.map((_, i) => `@${i}`).join(','); const fromIx = args.sensorIds.length; const toIx = args.sensorIds.length + 1;
    const rows = await withReadUncommittedRetry(this.dataSource, (m) => m.query(`SELECT sensor_id AS sensorId, bucket_ts AS ts, avg_value AS avg, min_value AS min, max_value AS max, last_value AS last, samples FROM ${table} WITH (NOLOCK) WHERE sensor_id IN (${inList}) AND bucket_ts >= @${fromIx} AND bucket_ts <= @${toIx} ORDER BY sensor_id ASC, bucket_ts ASC`, [...args.sensorIds, args.from, args.to]));
    const map = new Map<string, any[]>();
    for (const r of rows) { const sid = String(r.sensorId); const list = map.get(sid) ?? []; list.push({ ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts, avg: Number(r.avg), min: Number(r.min), max: Number(r.max), last: r.last == null ? null : Number(r.last), samples: Number(r.samples) }); map.set(sid, list); }
    return map;
  }
}
