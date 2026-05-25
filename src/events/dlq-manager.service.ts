import { Injectable, Inject } from '@nestjs/common';
import { RedisEventBus } from './redis-event-bus';

@Injectable()
export class DlqManagerService {
  constructor(
    @Inject('REDIS_EVENT_BUS') private readonly redisEventBus: RedisEventBus,
  ) {}

  async getStreamLag() { return this.redisEventBus.getStreamLag(); }
}
