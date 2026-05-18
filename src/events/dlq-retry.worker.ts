/**
 * DLQ Retry Worker
 * 
 * PHASE 4: Automatic retry of failed events from Dead Letter Queue
 * 
 * Strategy:
 * - Read from DLQ stream
 * - Retry with exponential backoff: 1s, 5s, 30s
 * - Max retries: 5
 * - After max retries → log as permanently failed
 * - Respects idempotency
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import type { EventBus } from './event-bus.interface';
import { IdempotencyService } from './idempotency.service';

interface DLQEntry {
  messageId: string;
  originalEventType: string;
  originalPayload: string;
  failureReason: string;
  failedAt: string;
  retryCount: number;
}

@Injectable()
export class DLQRetryWorker implements OnModuleInit {
  private readonly logger = new Logger(DLQRetryWorker.name);
  private readonly redis: Redis;
  private readonly dlqStreamName: string;
  private readonly consumerGroup = 'dlq-retry-workers';
  private readonly consumerId: string;
  private readonly maxRetries = 5;
  
  // Exponential backoff delays (milliseconds)
  private readonly retryDelays = [1000, 5000, 30000, 60000, 300000]; // 1s, 5s, 30s, 1m, 5m
  
  // Metrics
  private totalRetried = 0;
  private totalSucceeded = 0;
  private totalPermanentlyFailed = 0;
  
  private isRunning = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly idempotencyService: IdempotencyService,
  ) {
    this.redis = new Redis(
      process.env.REDIS_URL || 'redis://localhost:6379',
      {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      },
    );

    this.dlqStreamName = 'anomalies:detected.dlq';
    this.consumerId = this.generateConsumerId();
  }

  /**
   * Start DLQ retry worker on module init
   */
  async onModuleInit(): Promise<void> {
    await this.initializeConsumerGroup();
    
    // Start worker in background
    this.startWorker();
    
    this.logger.log('DLQ Retry Worker initialized');
  }

  /**
   * Generate unique consumer ID
   */
  private generateConsumerId(): string {
    const os = require('os');
    const hostname = os.hostname();
    const pid = process.pid;
    return `dlq-retry-${hostname}-${pid}`;
  }

  /**
   * Initialize consumer group for DLQ
   */
  private async initializeConsumerGroup(): Promise<void> {
    try {
      await this.redis.xgroup(
        'CREATE',
        this.dlqStreamName,
        this.consumerGroup,
        '$',
        'MKSTREAM',
      );
      this.logger.log(`DLQ consumer group created: ${this.consumerGroup}`);
    } catch (error: any) {
      if (error.message.includes('BUSYGROUP')) {
        this.logger.log(`DLQ consumer group already exists: ${this.consumerGroup}`);
      } else {
        this.logger.error(`Failed to create DLQ consumer group: ${error.message}`);
      }
    }
  }

  /**
   * Start retry worker loop
   */
  private startWorker(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.logger.log(`Starting DLQ retry worker: ${this.consumerId}`);

    // Run worker loop
    setImmediate(() => this.workerLoop());
  }

  /**
   * Main worker loop
   */
  private async workerLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Read from DLQ stream
        const results = await this.redis.xreadgroup(
          'GROUP',
          this.consumerGroup,
          this.consumerId,
          'COUNT',
          5, // Process 5 at a time
          'BLOCK',
          5000, // 5 second timeout
          'STREAMS',
          this.dlqStreamName,
          '>', // Only new messages
        );

        if (!results || results.length === 0) {
          continue;
        }

        // Process DLQ entries
        for (const [stream, messages] of results as any) {
          for (const [messageId, fields] of messages) {
            await this.processDLQEntry(messageId, fields);
          }
        }
      } catch (error: any) {
        this.logger.error(`DLQ worker error: ${error.message}`);
        await this.sleep(5000); // Backoff on error
      }
    }
  }

  /**
   * Process single DLQ entry
   */
  private async processDLQEntry(
    messageId: string,
    fields: string[],
  ): Promise<void> {
    try {
      // Parse DLQ entry
      const entry = this.parseDLQEntry(fields);
      
      this.logger.log(
        `Processing DLQ entry: ${messageId.substring(0, 10)}... ` +
        `(retry ${entry.retryCount}/${this.maxRetries})`,
      );

      // Check if max retries exceeded
      if (entry.retryCount >= this.maxRetries) {
        await this.handlePermanentFailure(entry, messageId);
        await this.redis.xack(this.dlqStreamName, this.consumerGroup, messageId);
        return;
      }

      // Calculate backoff delay
      const delayMs = this.retryDelays[entry.retryCount] || this.retryDelays[this.retryDelays.length - 1];
      
      // Wait for backoff
      await this.sleep(delayMs);

      // Attempt retry
      const success = await this.retryEvent(entry);

      if (success) {
        this.totalSucceeded++;
        this.logger.log(
          `DLQ retry succeeded: ${messageId.substring(0, 10)}...`,
        );
        
        // Acknowledge DLQ message
        await this.redis.xack(this.dlqStreamName, this.consumerGroup, messageId);
      } else {
        this.totalRetried++;
        
        // Re-queue with incremented retry count
        await this.requeueWithIncrementedRetry(entry);
        
        // Acknowledge original DLQ message
        await this.redis.xack(this.dlqStreamName, this.consumerGroup, messageId);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to process DLQ entry ${messageId}: ${error.message}`,
      );
      // Don't ACK - let it retry
    }
  }

  /**
   * Parse DLQ entry from Redis fields
   */
  private parseDLQEntry(fields: string[]): DLQEntry {
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }

    return {
      messageId: data.original_message_id || '',
      originalEventType: data.original_event_type || '',
      originalPayload: data.original_payload || '{}',
      failureReason: data.failure_reason || '',
      failedAt: data.failed_at || new Date().toISOString(),
      retryCount: parseInt(data.retry_count || '0', 10),
    };
  }

  /**
   * Retry event by republishing to main stream
   */
  private async retryEvent(entry: DLQEntry): Promise<boolean> {
    try {
      // Parse original event
      const event = JSON.parse(entry.originalPayload);
      
      // Check idempotency (don't retry if already processed)
      const eventId = event.eventId;
      if (eventId) {
        const alreadyProcessed = await this.idempotencyService.isEventProcessed(eventId);
        if (alreadyProcessed) {
          this.logger.debug(`Event already processed, skipping retry: ${eventId}`);
          return true; // Consider it a success
        }
      }

      // Republish to main stream
      await this.eventBus.publish(event);
      
      return true;
    } catch (error: any) {
      this.logger.error(`Retry failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Re-queue DLQ entry with incremented retry count
   */
  private async requeueWithIncrementedRetry(entry: DLQEntry): Promise<void> {
    try {
      await this.redis.xadd(
        this.dlqStreamName,
        '*',
        'original_message_id', entry.messageId,
        'original_event_type', entry.originalEventType,
        'original_payload', entry.originalPayload,
        'failure_reason', entry.failureReason,
        'failed_at', entry.failedAt,
        'retry_count', String(entry.retryCount + 1),
      );
    } catch (error: any) {
      this.logger.error(`Failed to requeue DLQ entry: ${error.message}`);
    }
  }

  /**
   * Handle permanently failed event (max retries exceeded)
   */
  private async handlePermanentFailure(
    entry: DLQEntry,
    messageId: string,
  ): Promise<void> {
    this.totalPermanentlyFailed++;
    
    this.logger.error(
      `PERMANENT FAILURE: Event ${messageId.substring(0, 10)}... ` +
      `failed after ${entry.retryCount} retries. ` +
      `Reason: ${entry.failureReason}`,
    );

    // TODO: Send to permanent failure log/alerting system
    // For now, just log
  }

  /**
   * Get worker statistics
   */
  getStats(): {
    total_retried: number;
    total_succeeded: number;
    total_permanently_failed: number;
    success_rate: number;
  } {
    const total = this.totalRetried + this.totalSucceeded;
    return {
      total_retried: this.totalRetried,
      total_succeeded: this.totalSucceeded,
      total_permanently_failed: this.totalPermanentlyFailed,
      success_rate: total > 0 ? (this.totalSucceeded / total) * 100 : 0,
    };
  }

  /**
   * Stop worker
   */
  stop(): void {
    this.isRunning = false;
    this.logger.log('DLQ retry worker stopped');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
