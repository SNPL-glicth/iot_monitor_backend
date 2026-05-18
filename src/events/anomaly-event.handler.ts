/**
 * Anomaly Event Handler
 * 
 * PHASE 3: Event-Driven Architecture
 * 
 * Consumes anomaly.detected.v1 events and broadcasts to WebSocket clients.
 * 
 * CRITICAL:
 * - Deduplication via LRU cache
 * - Never blocks event processing
 * - Graceful error handling
 */

import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { EventHandler } from './event-bus.interface';
import { AnomalyDetectedEvent } from './domain-event';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { IdempotencyService } from './idempotency.service';

interface AnomalyEventDto {
  id: string;
  sensorId: string;
  deviceId: string;
  eventCode: string;
  eventType: string;
  detectedAt: string;
  value: number;
  anomalyScore: number;
  source: string;
  reason: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AnomalyEventHandler implements EventHandler<AnomalyDetectedEvent> {
  private readonly logger = new Logger(AnomalyEventHandler.name);

  // Deduplication cache
  private readonly processedEvents: LRUCache<string, number>;

  // Metrics
  private totalProcessed = 0;
  private totalDuplicates = 0;
  private totalErrors = 0;

  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly idempotencyService: IdempotencyService,
  ) {
    // LRU cache with 1-minute TTL (in-memory fast path)
    this.processedEvents = new LRUCache<string, number>({
      max: 50000, // Support high-throughput systems
      ttl: 60_000, // 1 minute deduplication window
    });

    // Log metrics every minute
    setInterval(() => this.logMetrics(), 60_000);
  }

  /**
   * Handle anomaly detected event
   * 
   * PHASE 4: Persistent idempotency check
   * CRITICAL: Never throws - logs errors instead
   */
  async handle(event: AnomalyDetectedEvent): Promise<void> {
    try {
      const eventId = event.eventId;
      const idempotencyKey = event.payload.idempotencyKey;
      
      // 1. Fast path: In-memory deduplication (LRU cache)
      if (this.isDuplicate(idempotencyKey)) {
        this.totalDuplicates++;
        this.logger.debug(
          `Duplicate event (cache): ${idempotencyKey.substring(0, 10)}...`,
        );
        return;
      }
      
      // 2. PHASE 4: Persistent idempotency check (SQL Server)
      const shouldProcess = await this.idempotencyService.tryProcessEvent(
        eventId,
        'anomaly-handler',
        event.eventType,
      );
      
      if (!shouldProcess) {
        this.totalDuplicates++;
        this.logger.debug(
          `Duplicate event (persistent): ${eventId.substring(0, 10)}...`,
        );
        return;
      }

      // 2. Transform to DTO
      const dto = this.transformToDto(event);

      // 3. Broadcast via WebSocket
      // CRITICAL FIX: Use 'ml/events/active' to match poller and Flutter
      this.gateway.broadcast('ml/events/active', dto);

      // 4. Mark as processed
      this.processedEvents.set(event.payload.idempotencyKey, Date.now());
      this.totalProcessed++;

      // VERIFICATION LOG: Event broadcast to WebSocket
      this.logger.log(
        `✅ EVENT BROADCASTED → WebSocket: sensor=${event.payload.sensorId} ` +
        `code=${event.payload.eventCode} source=${event.payload.source}`,
      );
    } catch (error: any) {
      this.totalErrors++;
      this.logger.error(
        `Failed to handle anomaly event: ${error.message}`,
        error.stack,
      );
      // DO NOT throw - event bus will retry
    }
  }

  /**
   * Check if event already processed
   */
  private isDuplicate(idempotencyKey: string): boolean {
    return this.processedEvents.has(idempotencyKey);
  }

  /**
   * Transform domain event to DTO for WebSocket
   */
  private transformToDto(event: AnomalyDetectedEvent): AnomalyEventDto {
    return {
      id: event.eventId,
      sensorId: event.payload.sensorId,
      deviceId: event.payload.deviceId,
      eventCode: event.payload.eventCode,
      eventType: event.payload.eventType,
      detectedAt: event.payload.detectedAt,
      value: event.payload.value,
      anomalyScore: event.payload.anomalyScore,
      source: event.payload.source,
      reason: event.payload.reason,
      metadata: event.payload.metadata,
    };
  }

  /**
   * Get handler metrics
   */
  getMetrics() {
    return {
      totalProcessed: this.totalProcessed,
      totalDuplicates: this.totalDuplicates,
      totalErrors: this.totalErrors,
      cacheSize: this.processedEvents.size,
      duplicateRate:
        this.totalProcessed > 0
          ? (this.totalDuplicates / this.totalProcessed) * 100
          : 0,
      errorRate:
        this.totalProcessed > 0
          ? (this.totalErrors / this.totalProcessed) * 100
          : 0,
    };
  }

  /**
   * Log metrics periodically
   */
  private logMetrics(): void {
    const metrics = this.getMetrics();
    this.logger.log(
      `Anomaly handler metrics: processed=${metrics.totalProcessed} ` +
      `duplicates=${metrics.totalDuplicates} (${metrics.duplicateRate.toFixed(2)}%) ` +
      `errors=${metrics.totalErrors} (${metrics.errorRate.toFixed(2)}%)`,
    );

    // Reset counters
    this.totalProcessed = 0;
    this.totalDuplicates = 0;
    this.totalErrors = 0;
  }
}
