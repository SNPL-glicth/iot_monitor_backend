import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MlEventActiveView } from '../entities/views';
import {
  AuthCtx,
  crmCache,
  CACHE_TTL,
  clampPageSize,
  parseDateOrThrow,
  withReadUncommittedRetry,
} from './crm-base.service';

type DashboardQuery = {
  from?: string;
  to?: string;
  alertsLimit: number;
  eventsLimit: number;
  topDevicesLimit: number;
};

type MlEventsQuery = {
  page: number;
  pageSize: number;
  deviceId?: string;
  sensorId?: string;
  eventType?: string;
  eventCode?: string;
  from?: string;
  to?: string;
};

/**
 * SOLID-SRP: Dashboard y métricas globales del CRM.
 * No toca dispositivos individuales ni alertas.
 */
@Injectable()
export class CrmDashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getDashboard(query: DashboardQuery, ctx: AuthCtx) {
    const now = new Date();
    const to = query.to ? parseDateOrThrow('to', query.to) : now;
    const from = query.from
      ? parseDateOrThrow('from', query.from)
      : new Date(to.getTime() - 24 * 60 * 60 * 1000);

    if (from.getTime() > to.getTime()) {
      throw new Error('from debe ser <= to');
    }

    const alertsLimit = clampPageSize(query.alertsLimit || 50, 200);
    const eventsLimit = clampPageSize(query.eventsLimit || 50, 200);
    const topDevicesLimit = clampPageSize(query.topDevicesLimit || 10, 100);

    const {
      devicesByStatus,
      activeAlertsBySeverity,
      topDevicesByActiveAlerts,
      alertQueue,
      recentEvents,
    } = await withReadUncommittedRetry(this.dataSource, async (manager) => {
      const devicesByStatus = await manager.query(
        `SELECT d.status, COUNT(1) AS cnt FROM devices d WITH (NOLOCK) WHERE d.status != 'deleted' GROUP BY d.status`,
        [],
      );

      const activeAlertsBySeverity = await manager.query(
        `SELECT a.severity, COUNT(1) AS cnt FROM alerts a WITH (NOLOCK) JOIN devices d WITH (NOLOCK) ON d.id = a.device_id WHERE a.status IN ('active', 'acknowledged') AND d.status != 'deleted' GROUP BY a.severity`,
        [],
      );

      const topDevicesByActiveAlerts = await manager.query(
        `SELECT TOP (${topDevicesLimit}) a.device_id AS deviceId, d.device_uuid AS deviceUuid, d.name AS deviceName, COUNT(1) AS activeAlerts FROM alerts a WITH (NOLOCK) JOIN devices d WITH (NOLOCK) ON d.id = a.device_id WHERE a.status IN ('active', 'acknowledged') AND d.status != 'deleted' GROUP BY a.device_id, d.device_uuid, d.name ORDER BY COUNT(1) DESC, d.name ASC`,
        [],
      );

      const alertQueue = await manager.query(
        `SELECT TOP (${alertsLimit}) ah.* FROM v_alerts_history ah WITH (NOLOCK) JOIN devices d WITH (NOLOCK) ON d.id = ah.device_id WHERE ah.status IN ('active', 'acknowledged') AND ah.triggered_at >= @0 AND ah.triggered_at <= @1 AND d.status != 'deleted' ORDER BY ah.triggered_at DESC`,
        [from, to],
      );

      const recentEvents = await manager.query(
        `SELECT TOP (${eventsLimit}) t.event_type AS eventType, t.device_id AS deviceId, d.device_uuid AS deviceUuid, d.name AS deviceName, t.sensor_id AS sensorId, t.occurred_at AS occurredAt, t.severity, t.title, t.payload FROM v_device_timeline t WITH (NOLOCK) JOIN devices d WITH (NOLOCK) ON d.id = t.device_id WHERE t.occurred_at >= @0 AND t.occurred_at <= @1 AND d.status != 'deleted' ORDER BY t.occurred_at DESC`,
        [from, to],
      );

      return { devicesByStatus, activeAlertsBySeverity, topDevicesByActiveAlerts, alertQueue, recentEvents };
    });

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

  async getMlEventsBadge(_ctx: AuthCtx) {
    const cacheKey = 'badge:ml_events';
    const cached = crmCache.get<{ totalActiveMlEvents: number }>(cacheKey);
    if (cached) return cached;

    const total = await withReadUncommittedRetry(this.dataSource, async (manager) =>
      manager.getRepository(MlEventActiveView).count(),
    );
    const result = { totalActiveMlEvents: total };
    crmCache.set(cacheKey, result, CACHE_TTL.BADGE);
    return result;
  }

  invalidateBadgeCache(): void {
    crmCache.invalidate('badge:ml_events');
  }

  invalidateDashboardCache(): void {
    crmCache.invalidatePattern('dashboard:');
  }

  invalidateAllCache(): void {
    crmCache.clear();
  }

  async listMlEvents(query: MlEventsQuery, _ctx: AuthCtx) {
    const page = Math.max(1, Math.floor(query.page || 1));
    const pageSize = clampPageSize(query.pageSize || 50, 200);

    return withReadUncommittedRetry(this.dataSource, async (manager) => {
      const qb = manager
        .getRepository(MlEventActiveView)
        .createQueryBuilder('e')
        .setLock('dirty_read')
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
    });
  }
}
