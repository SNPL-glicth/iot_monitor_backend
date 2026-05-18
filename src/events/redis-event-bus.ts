/**
 * Redis Streams Event Bus
 * 
 * PHASE 3: Event-Driven Architecture
 * 
 * IMPLEMENTATION:
 * - Uses Redis Streams for durability
 * - Consumer groups for competing consumers
 * - At-least-once delivery
 * - Automatic retry with exponential backoff
 * 
 * CRITICAL:
 * - Never blocks on publish
 * - Falls back to DLQ on failure
 * - Provides observability metrics
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { DomainEvent } from './domain-event';
import { EventBus, EventHandler, EventBusMetrics } from './event-bus.interface';
import { validateEvent, logValidationError } from './event-validator';

@Injectable()
export class RedisEventBus implements EventBus, OnModuleDestroy {
  private readonly logger = new Logger(RedisEventBus.name);
  private readonly redis: Redis;
  private readonly streamName: string;
  private readonly consumerGroup: string;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly dlqStreamName: string;
  private readonly maxRetries = 3;
  private readonly consumerId: string;
  private readonly idleTimeout = 30000; // 30 seconds
  
  // Metrics
  private totalPublished = 0;
  private totalFailed = 0;
  private publishRate = 0;
  private lastMetricsReset = Date.now();
  
  // Lag monitoring
  private streamLag = 0;
  private consumerCount = 0;
  
  // PHASE 4: Auto-claim tracking
  private totalAutoClaimed = 0;

  constructor(
    redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379',
    streamName: string = 'domain-events',
    consumerGroup: string = 'backend-consumers',
  ) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.streamName = streamName;
    this.consumerGroup = consumerGroup;
    this.dlqStreamName = `${streamName}.dlq`;
    
    // PHASE 4: Unique consumer ID (hostname + PID)
    this.consumerId = this.generateConsumerId();

    this.initializeConsumerGroup();
    this.startMetricsCollection();
    this.startLagMonitoring();
    this.startAutoClaimWorker();
  }

  /**
   * Initialize consumer group
   * 
   * Creates group if doesn't exist
   */
  private async initializeConsumerGroup(): Promise<void> {
    try {
      await this.redis.xgroup(
        'CREATE',
        this.streamName,
        this.consumerGroup,
        '$',
        'MKSTREAM',
      );
      this.logger.log(`Consumer group ${this.consumerGroup} created`);
    } catch (error: any) {
      if (error.message.includes('BUSYGROUP')) {
        this.logger.log(`Consumer group ${this.consumerGroup} already exists`);
      } else {
        this.logger.error(`Failed to create consumer group: ${error.message}`);
      }
    }
  }

  /**
   * Publish event to Redis Stream
   * 
   * CRITICAL: Never throws - returns false on failure
   */
  async publish(event: DomainEvent): Promise<boolean> {
    try {
      const serialized = this.serializeEvent(event);
      
      await this.redis.xadd(
        this.streamName,
        '*', // Auto-generate ID
        'eventType',
        event.eventType,
        'eventId',
        event.eventId,
        'payload',
        serialized,
      );

      this.totalPublished++;
      
      this.logger.debug(
        `Published event: ${event.eventType} (${event.eventId})`,
      );
      
      return true;
    } catch (error: any) {
      this.totalFailed++;
      this.logger.error(
        `Failed to publish event ${event.eventType}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Publish batch of events atomically
   * 
   * Uses Redis pipeline for atomicity
   */
  async publishBatch(events: DomainEvent[]): Promise<boolean> {
    if (events.length === 0) {
      return true;
    }

    try {
      const pipeline = this.redis.pipeline();

      for (const event of events) {
        const serialized = this.serializeEvent(event);
        pipeline.xadd(
          this.streamName,
          '*',
          'eventType',
          event.eventType,
          'eventId',
          event.eventId,
          'payload',
          serialized,
        );
      }

      await pipeline.exec();
      
      this.totalPublished += events.length;
      
      this.logger.debug(`Published ${events.length} events in batch`);
      
      return true;
    } catch (error: any) {
      this.totalFailed += events.length;
      this.logger.error(`Failed to publish batch: ${error.message}`);
      return false;
    }
  }

  /**
   * Subscribe to event type
   * 
   * Handlers are called when events arrive
   */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>,
  ): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }

    this.handlers.get(eventType)!.add(handler as EventHandler);

    this.logger.log(`Subscribed to ${eventType}`);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        handlers.delete(handler as EventHandler);
        if (handlers.size === 0) {
          this.handlers.delete(eventType);
        }
      }
    };
  }

  /**
   * Generate unique consumer ID
   * 
   * Format: hostname-pid-uuid
   */
  private generateConsumerId(): string {
    const os = require('os');
    const hostname = os.hostname();
    const pid = process.pid;
    const uuid = uuidv4().substring(0, 8);
    return `${hostname}-${pid}-${uuid}`;
  }
  
  /**
   * Start consuming events from stream
   * 
   * PHASE 4: Uses unique consumer ID for horizontal scaling
   */
  async startConsuming(): Promise<void> {
    this.logger.log(
      `Starting consumer: ${this.consumerId} for stream: ${this.streamName}`,
    );

    while (true) {
      try {
        // Read from consumer group with unique ID
        const results = await this.redis.xreadgroup(
          'GROUP',
          this.consumerGroup,
          this.consumerId,
          'COUNT',
          10, // Process 10 at a time
          'BLOCK',
          5000, // 5 second timeout
          'STREAMS',
          this.streamName,
          '>', // Only new messages
        );

        if (!results || results.length === 0) {
          continue;
        }

        // Process messages
        for (const [stream, messages] of results as any) {
          for (const [messageId, fields] of messages) {
            await this.processMessage(messageId, fields);
          }
        }
      } catch (error: any) {
        this.logger.error(`Consumer error: ${error.message}`);
        await this.sleep(1000); // Backoff on error
      }
    }
  }
  
  /**
   * Auto-claim stuck messages
   * 
   * PHASE 4: Claim messages idle for > 30 seconds
   */
  private startAutoClaimWorker(): void {
    setInterval(async () => {
      try {
        // Get pending messages
        const pending = await this.redis.xpending(
          this.streamName,
          this.consumerGroup,
          '-',
          '+',
          10, // Check 10 at a time
        );
        
        if (!Array.isArray(pending) || pending.length === 0) {
          return;
        }
        
        const now = Date.now();
        
        for (const entry of pending) {
          if (!Array.isArray(entry) || entry.length < 4) continue;
          
          const [messageId, consumerId, idleTime] = entry;
          
          // Claim if idle > 30 seconds
          if (idleTime > this.idleTimeout) {
            try {
              const claimed = await this.redis.xclaim(
                this.streamName,
                this.consumerGroup,
                this.consumerId,
                this.idleTimeout,
                messageId,
              );
              
              if (claimed && claimed.length > 0) {
                this.totalAutoClaimed++;
                this.logger.warn(
                  `Auto-claimed stuck message: ${messageId} ` +
                  `(was idle ${Math.round(idleTime / 1000)}s)`,
                );
                
                // Process claimed message
                const [claimedId, fields] = claimed[0] as [string, any];
                await this.processMessage(claimedId, fields);
              }
            } catch (claimError: any) {
              this.logger.error(
                `Failed to claim message ${messageId}: ${claimError.message}`,
              );
            }
          }
        }
      } catch (error: any) {
        this.logger.debug(`Auto-claim worker error: ${error.message}`);
      }
    }, 10000); // Run every 10 seconds
  }

  /**
   * Process single message with retry and DLQ logic
   */
  private async processMessage(
    messageId: string,
    fields: string[],
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Parse fields (Redis returns flat array)
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }

      const eventType = data.eventType;
      const event = this.deserializeEvent(data.payload);

      // PHASE 4: Validate event schema
      const validationResult = validateEvent(event);
      if (!validationResult.valid) {
        this.logger.error(
          `Invalid event schema: ${messageId.substring(0, 10)}...`,
        );
        logValidationError(validationResult, event);
        
        // Send invalid event to DLQ
        await this.handleFailedMessage(
          messageId,
          fields,
          `Schema validation failed: ${validationResult.errors.join(', ')}`,
        );
        return;
      }

      // Structured log: Event received
      this.logger.log(
        JSON.stringify({
          level: 'INFO',
          event: 'event_received',
          eventType,
          eventId: event.eventId || messageId.substring(0, 10),
          messageId: messageId.substring(0, 10),
        }),
      );

      // Get handlers for this event type
      const handlers = this.handlers.get(eventType);
      if (!handlers || handlers.size === 0) {
        this.logger.warn(`No handlers for event type: ${eventType}`);
        // No handlers - acknowledge anyway
        await this.redis.xack(this.streamName, this.consumerGroup, messageId);
        return;
      }

      // Execute all handlers with retry
      await this.executeHandlersWithRetry(event, handlers, messageId);

      // Acknowledge message
      await this.redis.xack(this.streamName, this.consumerGroup, messageId);
      
      // Structured log: Event processed
      const latencyMs = Date.now() - startTime;
      this.logger.log(
        JSON.stringify({
          level: 'INFO',
          event: 'event_processed',
          eventType,
          eventId: event.eventId,
          latency_ms: latencyMs,
        }),
      );
      
    } catch (error: any) {
      // Structured error log
      this.logger.error(
        JSON.stringify({
          level: 'ERROR',
          event: 'event_failed',
          messageId: messageId.substring(0, 10),
          error: error.message,
        }),
      );
      
      // Check retry count and send to DLQ if exceeded
      await this.handleFailedMessage(messageId, fields, error.message);
    }
  }
  
  /**
   * Execute handlers with retry logic
   */
  private async executeHandlersWithRetry(
    event: DomainEvent,
    handlers: Set<EventHandler>,
    messageId: string,
  ): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await Promise.all(
          Array.from(handlers).map((handler) => handler.handle(event)),
        );
        return; // Success
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `Handler failed (attempt ${attempt}/${this.maxRetries}): ${error.message}`,
        );
        
        if (attempt < this.maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          await this.sleep(100 * Math.pow(2, attempt - 1));
        }
      }
    }
    
    // All retries exhausted
    throw lastError || new Error('Handler execution failed');
  }
  
  /**
   * Handle failed message - send to DLQ after max retries
   */
  private async handleFailedMessage(
    messageId: string,
    fields: string[],
    errorReason: string,
  ): Promise<void> {
    try {
      // Parse original event
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }
      
      // Send to DLQ
      await this.redis.xadd(
        this.dlqStreamName,
        '*',
        'original_message_id', messageId,
        'original_event_type', data.eventType || 'unknown',
        'original_payload', data.payload || '{}',
        'failure_reason', errorReason,
        'failed_at', new Date().toISOString(),
        'retry_count', String(this.maxRetries),
      );
      
      // Acknowledge original message (prevent infinite retry)
      await this.redis.xack(this.streamName, this.consumerGroup, messageId);
      
      // Structured DLQ log
      this.logger.warn(
        JSON.stringify({
          level: 'WARNING',
          event: 'event_sent_to_dlq',
          messageId: messageId.substring(0, 10),
          error: errorReason,
          dlq_stream: this.dlqStreamName,
        }),
      );
      
    } catch (dlqError: any) {
      this.logger.error(`Failed to send to DLQ: ${dlqError.message}`);
      // Don't ACK - let it retry naturally
    }
  }

  /**
   * Serialize event to JSON
   */
  private serializeEvent(event: DomainEvent): string {
    return JSON.stringify(event);
  }

  /**
   * Deserialize event from JSON
   */
  private deserializeEvent(json: string): DomainEvent {
    return JSON.parse(json);
  }

  /**
   * Get metrics
   */
  getMetrics(): EventBusMetrics {
    const now = Date.now();
    const elapsed = (now - this.lastMetricsReset) / 1000;

    return {
      totalPublished: this.totalPublished,
      totalFailed: this.totalFailed,
      totalSubscribers: Array.from(this.handlers.values()).reduce(
        (sum, handlers) => sum + handlers.size,
        0,
      ),
      publishRate: elapsed > 0 ? this.totalPublished / elapsed : 0,
      errorRate:
        this.totalPublished > 0
          ? this.totalFailed / this.totalPublished
          : 0,
    };
  }

  /**
   * Monitor Redis Stream lag
   */
  private startLagMonitoring(): void {
    setInterval(async () => {
      try {
        // Get pending messages count
        const pending = await this.redis.xpending(
          this.streamName,
          this.consumerGroup,
        );
        
        if (Array.isArray(pending) && pending.length >= 1) {
          this.streamLag = (pending[0] as any) || 0;
        }
        
        // Get consumer count
        const groups = await this.redis.xinfo('GROUPS', this.streamName);
        if (Array.isArray(groups)) {
          this.consumerCount = groups.length;
        }
        
        // Log lag metrics
        if (this.streamLag > 0) {
          this.logger.log(
            `[METRICS] stream_lag=${this.streamLag} consumers=${this.consumerCount}`,
          );
        }
        
      } catch (error: any) {
        this.logger.debug(`Lag monitoring error: ${error.message}`);
      }
    }, 10000); // Every 10 seconds
  }
  
  /**
   * Get stream lag
   */
  async getStreamLag(): Promise<{ pending: number; consumers: number }> {
    return {
      pending: this.streamLag,
      consumers: this.consumerCount,
    };
  }
  
  /**
   * Reset metrics periodically
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      const metrics = this.getMetrics();
      this.logger.debug(
        `Event bus metrics: published=${metrics.totalPublished} ` +
        `failed=${metrics.totalFailed} rate=${metrics.publishRate.toFixed(2)}/s`,
      );
      
      // Reset counters
      this.totalPublished = 0;
      this.totalFailed = 0;
      this.lastMetricsReset = Date.now();
    }, 60000); // Every minute
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
    this.logger.log('Redis event bus disconnected');
  }
}
