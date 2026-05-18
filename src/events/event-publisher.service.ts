import { Injectable } from '@nestjs/common';
import { RedisEventBus } from './redis-event-bus';

@Injectable()
export class EventPublisherService {
  constructor(private readonly redisEventBus: RedisEventBus) {}

  async publish(event: any) { return this.redisEventBus.publish(event); }
  async publishBatch(events: any[]) { return this.redisEventBus.publishBatch(events); }
}
