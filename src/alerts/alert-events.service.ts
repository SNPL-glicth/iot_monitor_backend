import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { withTransaction } from '../common/utils/transaction.utils';
import { AlertEvent } from '../entities/alert-event.entity';

/**
 * Servicio para manejar el historial de eventos de alerta.
 * 
 * Este servicio proporciona acceso al historial COMPLETO de eventos,
 * a diferencia del servicio de alertas que solo muestra el estado actual.
 */
@Injectable()
export class AlertEventsService {
  private readonly logger = new Logger(AlertEventsService.name);

  constructor(
    @InjectRepository(AlertEvent)
    private readonly alertEventRepo: Repository<AlertEvent>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Obtiene el historial de eventos de un sensor específico.
   * 
   * @param sensorId ID del sensor
   * @param options Opciones de filtrado
   */
  async getSensorEventHistory(
    sensorId: string,
    options: {
      eventType?: string;
      severity?: string;
      status?: string;
      from?: Date;
      to?: Date;
      limit?: number;
    } = {},
  ): Promise<AlertEvent[]> {
    const { eventType, severity, status, from, to, limit = 100 } = options;

    const query = this.alertEventRepo
      .createQueryBuilder('ae')
      .where('ae.sensorId = :sensorId', { sensorId })
      .orderBy('ae.triggeredAt', 'DESC')
      .take(limit);

    if (eventType) {
      query.andWhere('ae.eventType = :eventType', { eventType });
    }

    if (severity) {
      query.andWhere('ae.severity = :severity', { severity });
    }

    if (status) {
      query.andWhere('ae.status = :status', { status });
    }

    if (from) {
      query.andWhere('ae.triggeredAt >= :from', { from });
    }

    if (to) {
      query.andWhere('ae.triggeredAt <= :to', { to });
    }

    return query.getMany();
  }

  /**
   * Obtiene el historial de eventos de un dispositivo.
   */
  async getDeviceEventHistory(
    deviceId: string,
    options: {
      eventType?: string;
      severity?: string;
      limit?: number;
    } = {},
  ): Promise<AlertEvent[]> {
    const { eventType, severity, limit = 100 } = options;

    const query = this.alertEventRepo
      .createQueryBuilder('ae')
      .where('ae.deviceId = :deviceId', { deviceId })
      .orderBy('ae.triggeredAt', 'DESC')
      .take(limit);

    if (eventType) {
      query.andWhere('ae.eventType = :eventType', { eventType });
    }

    if (severity) {
      query.andWhere('ae.severity = :severity', { severity });
    }

    return query.getMany();
  }

  /**
   * Obtiene estadísticas de eventos por sensor.
   */
  async getSensorEventStats(sensorId: string): Promise<{
    totalEvents: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    lastEventAt: Date | null;
  }> {
    const rows = await this.dataSource.query(
      `
      SELECT 
        COUNT(*) AS total,
        event_type,
        severity,
        MAX(triggered_at) AS last_event
      FROM alert_events
      WHERE sensor_id = @0
      GROUP BY event_type, severity
      `,
      [sensorId],
    );

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let totalEvents = 0;
    let lastEventAt: Date | null = null;

    for (const row of rows) {
      const count = parseInt(row.total, 10);
      totalEvents += count;

      byType[row.event_type] = (byType[row.event_type] || 0) + count;
      bySeverity[row.severity] = (bySeverity[row.severity] || 0) + count;

      if (row.last_event && (!lastEventAt || row.last_event > lastEventAt)) {
        lastEventAt = row.last_event;
      }
    }

    return { totalEvents, byType, bySeverity, lastEventAt };
  }

  /**
   * Marca un evento como acknowledged.
   * CRITICAL: Uses transaction to prevent lost updates
   */
  async acknowledgeEvent(eventId: string, userId: string): Promise<void> {
    await withTransaction(this.dataSource, async (manager) => {
      // Lock row to prevent concurrent acknowledgments
      const event = await manager.findOne(AlertEvent, {
        where: { id: eventId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!event) {
        throw new Error(`AlertEvent ${eventId} not found`);
      }

      // Only acknowledge if not already acknowledged/resolved
      if (event.status === 'active') {
        event.status = 'acknowledged';
        event.acknowledgedAt = new Date();
        event.acknowledgedBy = userId;
        await manager.save(event);
      }
    });
  }

  /**
   * Marca un evento como resuelto.
   * CRITICAL: Uses transaction to prevent lost updates
   */
  async resolveEvent(eventId: string, userId: string): Promise<void> {
    await withTransaction(this.dataSource, async (manager) => {
      // Lock row to prevent concurrent resolutions
      const event = await manager.findOne(AlertEvent, {
        where: { id: eventId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!event) {
        throw new Error(`AlertEvent ${eventId} not found`);
      }

      // Can resolve from any state
      event.status = 'resolved';
      event.resolvedAt = new Date();
      event.resolvedBy = userId;
      await manager.save(event);
    });
  }
}
