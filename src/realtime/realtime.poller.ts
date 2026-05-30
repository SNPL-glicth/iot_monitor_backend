import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as RealtimeInterfaces from './interfaces/realtime.interfaces';
import { RealtimeGateway } from './realtime.gateway';

export const REALTIME_SNAPSHOT_SERVICE = 'REALTIME_SNAPSHOT_SERVICE';
export const PAYLOAD_DEDUPLICATOR = 'PAYLOAD_DEDUPLICATOR';

@Injectable()
export class RealtimePollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimePollerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  constructor(
    @Inject(REALTIME_SNAPSHOT_SERVICE)
    private readonly snapshotService: RealtimeInterfaces.IRealtimeSnapshotService,
    @Inject(PAYLOAD_DEDUPLICATOR)
    private readonly deduplicator: RealtimeInterfaces.IPayloadDeduplicator,
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    const intervalMs = Math.max(
      5000,
      Number(process.env.REALTIME_POLL_INTERVAL_MS ?? '5000') || 5000,
    );
    this.logger.log(`Realtime poller enabled intervalMs=${intervalMs}`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.isTickRunning) {
      this.logger.debug('Skipping tick - previous tick still running');
      return;
    }

    this.isTickRunning = true;
    const start = Date.now();

    try {
      const snapshot = await this.snapshotService.fetchSnapshot();
      const broadcastSkipped = this.deduplicator.isDuplicate(snapshot);

      if (!broadcastSkipped) {
        this.broadcastSnapshot(snapshot);
      }

      this.logger.log('realtime_tick', {
        tickMs: Date.now() - start,
        partial: snapshot.partial,
        broadcastSkipped,
        cacheSize: this.deduplicator.cacheSize,
      });
    } catch (e) {
      this.logger.error('Tick failed', { error: String(e) });
    } finally {
      this.isTickRunning = false;
    }
  }

  private broadcastSnapshot(snapshot: RealtimeInterfaces.RealtimeSnapshot): void {
    this.gateway.broadcast('readings/latest', snapshot.readings);
    this.gateway.broadcast('alerts/active', snapshot.alerts);
    this.gateway.broadcast('predictions/latest', snapshot.predictions);
    this.gateway.broadcast('ml/events/active', snapshot.mlEvents);
    this.gateway.broadcast('sensors/consolidated', snapshot.consolidated);
  }
}
