/**
 * Events Module
 * 
 * CRITICAL FIX: Wires RedisEventBus consumer that was never started
 * 
 * This module:
 * 1. Creates RedisEventBus instance
 * 2. Subscribes AnomalyEventHandler
 * 3. Starts background consumer on module init
 */

import { Module, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { RedisEventBus } from './redis-event-bus';
import { EventPublisherService } from './event-publisher.service';
import { EventConsumerService } from './event-consumer.service';
import { DlqManagerService } from './dlq-manager.service';
import { AnomalyEventHandler } from './anomaly-event.handler';
import { NotificationEventHandler } from './notification-event.handler';
import { IdempotencyService } from './idempotency.service';
import { DLQRetryWorker } from './dlq-retry.worker';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: 'REDIS_EVENT_BUS',
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const streamName = 'anomalies:detected';
        const consumerGroup = 'backend-anomaly-consumers';
        
        return new RedisEventBus(redisUrl, streamName, consumerGroup);
      },
    },
    IdempotencyService,
    RealtimeGateway,
    AnomalyEventHandler,
    NotificationEventHandler,
    EventPublisherService,
    EventConsumerService,
    DlqManagerService,
    {
      provide: DLQRetryWorker,
      useFactory: (eventBus: RedisEventBus, idempotencyService: IdempotencyService) => {
        return new DLQRetryWorker(eventBus, idempotencyService);
      },
      inject: ['REDIS_EVENT_BUS', IdempotencyService],
    },
  ],
  exports: ['REDIS_EVENT_BUS', AnomalyEventHandler, NotificationEventHandler, IdempotencyService, EventPublisherService, EventConsumerService, DlqManagerService],
})
export class EventsModule implements OnModuleInit {
  private readonly logger = new Logger(EventsModule.name);

  constructor(
    @Inject('REDIS_EVENT_BUS') private readonly eventBus: RedisEventBus,
    private readonly handler: AnomalyEventHandler,
  ) {}

  async onModuleInit() {
    try {
      // Subscribe handler to anomaly events
      this.eventBus.subscribe('anomaly.detected.v1', this.handler);
      
      this.logger.log('AnomalyEventHandler subscribed to anomaly.detected.v1');
      
      // PHASE 4: Start consuming in background (uses auto-generated consumer ID)
      void this.eventBus.startConsuming();
      
      this.logger.log(`✅ Event consumer started (PHASE 4: horizontal scaling enabled)`);
      this.logger.log('Listening on stream: anomalies:detected');
      
    } catch (error: any) {
      this.logger.error(`Failed to start event consumer: ${error.message}`);
      // Don't throw - allow app to start even if events fail
    }
  }
}
