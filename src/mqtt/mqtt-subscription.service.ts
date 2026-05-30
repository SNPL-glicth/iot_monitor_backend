import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MqttService } from './mqtt.service';

@Injectable()
export class MqttSubscriptionService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly mqtt: MqttService) {}

  onModuleInit() {
    this.mqtt.onModuleInit();
  }

  onModuleDestroy() {
    this.mqtt.onModuleDestroy();
  }
}
