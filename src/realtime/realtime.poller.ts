import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';

import { MonitoringService } from '../monitoring/monitoring.service';
import { RealtimeGateway } from './realtime.gateway';

function hashJson(value: unknown): string {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class RealtimePollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimePollerService.name);

  private timer: NodeJS.Timeout | null = null;

  private lastReadingsHash: string | null = null;
  private lastAlertsHash: string | null = null;
  private lastPredictionsHash: string | null = null;
  private lastMlEventsHash: string | null = null;

  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit() {
    const intervalMs = Number(process.env.REALTIME_POLL_INTERVAL_MS ?? '3000') || 3000;

    this.logger.log(`Realtime poller enabled intervalMs=${intervalMs}`);

    // First tick immediately, then interval
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    try {
      let latestReadings: any[] = [];
      let alerts: any[] = [];
      let predictions: any[] = [];
      let mlEvents: any[] = [];

      try {
        latestReadings = await this.monitoringService.getLatestSensorReadings();
      } catch (e) {
        this.logger.warn(`getLatestSensorReadings failed: ${String((e as Error)?.message ?? e)}`);
      }

      try {
        alerts = await this.monitoringService.getActiveAlerts();
      } catch (e) {
        this.logger.warn(`getActiveAlerts failed: ${String((e as Error)?.message ?? e)}`);
      }

      try {
        predictions = await this.monitoringService.getLatestPredictions(50);
      } catch (e) {
        this.logger.warn(`getLatestPredictions failed: ${String((e as Error)?.message ?? e)}`);
      }

      try {
        mlEvents = await this.monitoringService.getActiveMlEvents(50);
      } catch (e) {
        this.logger.warn(`getActiveMlEvents failed: ${String((e as Error)?.message ?? e)}`);
      }

      const readingsHash = hashJson(latestReadings);
      if (this.lastReadingsHash !== readingsHash) {
        this.lastReadingsHash = readingsHash;
        this.gateway.broadcast('readings/latest', latestReadings);
      }

      const alertsHash = hashJson(alerts);
      if (this.lastAlertsHash !== alertsHash) {
        this.lastAlertsHash = alertsHash;
        this.gateway.broadcast('alerts/active', alerts);
      }

      const predHash = hashJson(predictions);
      if (this.lastPredictionsHash !== predHash) {
        this.lastPredictionsHash = predHash;
        this.gateway.broadcast('predictions/latest', predictions);
      }

      const mlEventsHash = hashJson(mlEvents);
      if (this.lastMlEventsHash !== mlEventsHash) {
        this.lastMlEventsHash = mlEventsHash;
        this.gateway.broadcast('ml/events/active', mlEvents);
      }
    } catch (e) {
      this.logger.warn(`tick failed (unexpected): ${String((e as Error)?.message ?? e)}`);
    }
  }
}
