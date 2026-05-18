import { Injectable } from '@nestjs/common';
import { RedisEventBus } from './redis-event-bus';

@Injectable()
export class EventConsumerService {
  constructor(private readonly redisEventBus: RedisEventBus) {}

  async startConsuming() { return this.redisEventBus.startConsuming(); }
  async onModuleDestroy() { return this.redisEventBus.onModuleDestroy(); }
}
