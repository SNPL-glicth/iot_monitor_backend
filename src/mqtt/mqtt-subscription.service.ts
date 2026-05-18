import { Injectable } from '@nestjs/common';
import { MqttService } from './mqtt.service';

@Injectable()
export class MqttSubscriptionService {
  constructor(private readonly mqtt: MqttService) {}

  async onModuleInit() { return this.mqtt.onModuleInit(); }
  async onModuleDestroy() { return this.mqtt.onModuleDestroy(); }
}
