import { Injectable } from '@nestjs/common';
import { RedisEventBus } from './redis-event-bus';

@Injectable()
export class DlqManagerService {
  constructor(private readonly redisEventBus: RedisEventBus) {}

  async getStreamLag() { return this.redisEventBus.getStreamLag(); }
}
