import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Alert } from '../entities/alert.entity';
import { AlertsHistoryView } from '../entities/views';
import {
  AuthCtx,
  assertDeviceWriteAccess,
  requireUserId,
  clampPageSize,
  withReadUncommittedRetry,
} from './crm-base.service';

type AlertsQuery = {
  page: number;
  pageSize: number;
  status?: string;
  severity?: string;
  deviceId?: string;
  sensorId?: string;
  from?: string;
  to?: string;
};

/**
 * SOLID-SRP: Operaciones sobre alertas del CRM.
 * No toca dispositivos ni dashboard.
 */
@Injectable()
export class CrmAlertService {
  constructor(private readonly dataSource: DataSource) {}

  async listAlerts(query: AlertsQuery, _ctx: AuthCtx) {
    const page = Math.max(1, Math.floor(query.page || 1));
    const pageSize = clampPageSize(query.pageSize || 50, 200);

    return withReadUncommittedRetry(this.dataSource, async (manager) => {
      const qb = manager
        .getRepository(AlertsHistoryView)
        .createQueryBuilder('a')
        .setLock('dirty_read')
        .orderBy('a.triggeredAt', 'DESC');

      if (query.status) qb.andWhere('a.status = :status', { status: query.status });
      if (query.severity) qb.andWhere('a.severity = :severity', { severity: query.severity });
      if (query.deviceId) qb.andWhere('a.deviceId = :deviceId', { deviceId: String(query.deviceId) });
      if (query.sensorId) qb.andWhere('a.sensorId = :sensorId', { sensorId: String(query.sensorId) });
      if (query.from) qb.andWhere('a.triggeredAt >= :from', { from: new Date(query.from) });
      if (query.to) qb.andWhere('a.triggeredAt <= :to', { to: new Date(query.to) });

      const [items, total] = await qb
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();

      return { page, pageSize, total, items };
    });
  }

  async acknowledgeAlert(alertId: number, ctx: AuthCtx) {
    requireUserId(ctx);
    return withReadUncommittedRetry(
      this.dataSource,
      async (manager) => {
        const row = await manager.findOne(Alert, { where: { id: String(alertId) } });
        if (!row) throw new NotFoundException('Alerta no encontrada');
        await assertDeviceWriteAccess(this.dataSource, Number(row.deviceId), ctx);
        if (row.status === 'resolved') {
          return { success: true, status: row.status };
        }
        row.status = 'acknowledged';
        row.acknowledgedAt = new Date();
        row.acknowledgedById = ctx.userId;
        await manager.save(row);
        return { success: true };
      },
      { retries: 3, baseDelayMs: 50 },
    );
  }

  async resolveAlert(alertId: number, ctx: AuthCtx) {
    requireUserId(ctx);
    return withReadUncommittedRetry(
      this.dataSource,
      async (manager) => {
        const row = await manager.findOne(Alert, { where: { id: String(alertId) } });
        if (!row) throw new NotFoundException('Alerta no encontrada');
        await assertDeviceWriteAccess(this.dataSource, Number(row.deviceId), ctx);
        if (!row.acknowledgedAt) {
          row.acknowledgedAt = new Date();
          row.acknowledgedById = ctx.userId;
        }
        row.status = 'resolved';
        row.resolvedAt = new Date();
        row.resolvedById = ctx.userId;
        await manager.save(row);
        return { success: true };
      },
      { retries: 3, baseDelayMs: 50 },
    );
  }

  async getAlertSnapshot(alertId: number, _ctx: AuthCtx) {
    return withReadUncommittedRetry(this.dataSource, async (manager) => {
      const snapshot = await manager.query(
        `SELECT id, alert_id AS alertId, sensor_id AS sensorId, device_id AS deviceId, sensor_name AS sensorName, device_name AS deviceName, unit, sensor_type AS sensorType, triggered_at AS triggeredAt, triggered_value AS triggeredValue, severity, threshold_warning_min AS warningMin, threshold_warning_max AS warningMax, threshold_alert_min AS alertMin, threshold_alert_max AS alertMax, series_data AS seriesData, context_from AS contextFrom, context_to AS contextTo, point_count AS pointCount, created_at AS createdAt FROM alert_snapshots WITH (NOLOCK) WHERE alert_id = @0`,
        [alertId],
      );

      if (snapshot.length === 0) {
        try {
          await manager.query(`EXEC sp_create_alert_snapshot @p_alert_id = @0`, [alertId]);
          const retrySnapshot = await manager.query(
            `SELECT id, alert_id AS alertId, sensor_id AS sensorId, device_id AS deviceId, sensor_name AS sensorName, device_name AS deviceName, unit, sensor_type AS sensorType, triggered_at AS triggeredAt, triggered_value AS triggeredValue, severity, threshold_warning_min AS warningMin, threshold_warning_max AS warningMax, threshold_alert_min AS alertMin, threshold_alert_max AS alertMax, series_data AS seriesData, context_from AS contextFrom, context_to AS contextTo, point_count AS pointCount, created_at AS createdAt FROM alert_snapshots WITH (NOLOCK) WHERE alert_id = @0`,
            [alertId],
          );
          if (retrySnapshot.length === 0) {
            throw new NotFoundException('No se pudo crear snapshot para la alerta');
          }
          return this.formatSnapshot(retrySnapshot[0]);
        } catch {
          throw new NotFoundException('Snapshot no encontrado para la alerta');
        }
      }

      return this.formatSnapshot(snapshot[0]);
    });
  }

  private formatSnapshot(row: any) {
    let series: Array<{ ts: string; value: number; state: string }> = [];
    try {
      series = typeof row.seriesData === 'string' ? JSON.parse(row.seriesData) : row.seriesData || [];
    } catch {
      series = [];
    }

    return {
      alertId: Number(row.alertId),
      sensorId: String(row.sensorId),
      deviceId: String(row.deviceId),
      sensorName: row.sensorName,
      deviceName: row.deviceName,
      unit: row.unit,
      sensorType: row.sensorType,
      triggeredAt: row.triggeredAt instanceof Date ? row.triggeredAt.toISOString() : row.triggeredAt,
      triggeredValue: Number(row.triggeredValue),
      severity: row.severity,
      thresholds: {
        warningMin: row.warningMin !== null ? Number(row.warningMin) : null,
        warningMax: row.warningMax !== null ? Number(row.warningMax) : null,
        alertMin: row.alertMin !== null ? Number(row.alertMin) : null,
        alertMax: row.alertMax !== null ? Number(row.alertMax) : null,
      },
      series: series.map((p) => ({ timestamp: p.ts, value: Number(p.value), state: p.state })),
      contextFrom: row.contextFrom instanceof Date ? row.contextFrom.toISOString() : row.contextFrom,
      contextTo: row.contextTo instanceof Date ? row.contextTo.toISOString() : row.contextTo,
      pointCount: Number(row.pointCount),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    };
  }
}
