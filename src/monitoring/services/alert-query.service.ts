import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from '../../entities/alert.entity';
import { ActiveAlertView, MlEventActiveView } from '../../entities/views';
import { formatDateTime } from '../../shared/date-format.util';
import { withDeadlockRetry } from '../../shared/deadlock-retry.util';

/**
 * AlertQueryService — Consulta de alertas activas, eventos ML e historial.
 *
 * SOLID-SRP: Solo lectura de alertas. Sin mutación de estado.
 */
@Injectable()
export class AlertQueryService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(ActiveAlertView)
    private readonly activeAlertViewRepo: Repository<ActiveAlertView>,
    @InjectRepository(MlEventActiveView)
    private readonly mlEventActiveViewRepo: Repository<MlEventActiveView>,
  ) {}

  /**
   * Devuelve alertas activas/acknowledged (vista v_active_alerts)
   */
  async getActiveAlerts(limit = 100) {
    const rows = await withDeadlockRetry(() =>
      this.activeAlertViewRepo
        .createQueryBuilder('a')
        .orderBy('a.triggeredAt', 'DESC')
        .limit(limit)
        .getMany(),
    );
    return rows.map((row) => ({
      ...row,
      sensorId: row.sensorId,
      deviceId: row.deviceId,
      thresholdName: row.thresholdName ?? 'Alerta de umbral',
      conditionType: row.conditionType ?? 'unknown',
      triggeredAt: formatDateTime(row.triggeredAt ?? null),
    }));
  }

  /**
   * Devuelve eventos ML activos/acknowledged (vista v_ml_events_active)
   */
  async getActiveMlEvents(limit = 50) {
    const rows = await withDeadlockRetry(() =>
      this.mlEventActiveViewRepo
        .createQueryBuilder('e')
        .orderBy('e.createdAt', 'DESC')
        .limit(limit)
        .getMany(),
    );

    return rows.map((row) => ({
      ...row,
      createdAt: formatDateTime(row.createdAt ?? null),
      targetTimestamp: formatDateTime(row.targetTimestamp ?? null),
    }));
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
      triggeredAt: formatDateTime(a.triggeredAt),
      acknowledgedAt: formatDateTime(a.acknowledgedAt ?? null),
      resolvedAt: formatDateTime(a.resolvedAt ?? null),
    }));
  }
}
