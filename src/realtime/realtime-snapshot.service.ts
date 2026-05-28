import { Injectable, Logger } from '@nestjs/common';
import { IRealtimeSnapshotService, RealtimeSnapshot } from './interfaces/realtime.interfaces';

interface IMonitoringRepository {
  getLatestSensorReadings(): Promise<unknown[]>;
  getActiveAlerts(): Promise<unknown[]>;
  getLatestPredictions(limit: number): Promise<unknown[]>;
  getActiveMlEvents(limit: number): Promise<unknown[]>;
  getAllSensorsConsolidatedStatus(): Promise<unknown[]>;
}

@Injectable()
export class RealtimeSnapshotService implements IRealtimeSnapshotService {
  private readonly logger = new Logger(RealtimeSnapshotService.name);
  private cache: Partial<RealtimeSnapshot> = {};
  private snapshotAt = new Date(0);

  constructor(private readonly repository: IMonitoringRepository) {}

  get lastSnapshotAt(): Date {
    return this.snapshotAt;
  }

  async fetchSnapshot(): Promise<RealtimeSnapshot> {
    const start = Date.now();

    const promises = [
      this.repository.getLatestSensorReadings().catch(this.handleError('readings')),
      this.repository.getActiveAlerts().catch(this.handleError('alerts')),
      this.repository.getLatestPredictions(50).catch(this.handleError('predictions')),
      this.repository.getActiveMlEvents(50).catch(this.handleError('mlEvents')),
      this.repository.getAllSensorsConsolidatedStatus().catch(this.handleError('consolidated')),
    ];

    const results = await Promise.allSettled(promises);
    const [readings, alerts, predictions, mlEvents, consolidated] = results.map(
      (r) => (r.status === 'fulfilled' ? r.value : undefined)
    );

    const partial = results.some((r) => r.status === 'rejected');

    if (partial) {
      this.logger.warn('realtime_partial_snapshot', {
        tickMs: Date.now() - start,
      });
    }

    const snapshot: RealtimeSnapshot = {
      readings: this.fallback(readings, this.cache.readings, 'readings'),
      alerts: this.fallback(alerts, this.cache.alerts, 'alerts'),
      predictions: this.fallback(predictions, this.cache.predictions, 'predictions'),
      mlEvents: this.fallback(mlEvents, this.cache.mlEvents, 'mlEvents'),
      consolidated: this.fallback(consolidated, this.cache.consolidated, 'consolidated'),
      partial,
      timestamp: new Date(),
    };

    this.cache = { ...snapshot };
    this.snapshotAt = snapshot.timestamp;

    return snapshot;
  }

  private fallback<T>(
    current: T | undefined,
    cached: T | undefined,
    name: string
  ): T {
    if (current !== undefined) return current;
    this.logger.warn(`Using cached ${name} due to query failure`);
    return (cached ?? []) as T;
  }

  private handleError(name: string): (reason: unknown) => Promise<never> {
    return async (reason: unknown) => {
      this.logger.error(`Query failed: ${name}`, {
        error: String(reason),
      });
      throw reason;
    };
  }
}
