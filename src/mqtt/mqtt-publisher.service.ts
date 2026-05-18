import { Injectable } from '@nestjs/common';
import { MqttService } from './mqtt.service';

@Injectable()
export class MqttPublisherService {
  constructor(private readonly mqtt: MqttService) {}

  async publishNotification(userId: string, payload: any) { return this.mqtt.publishNotification(userId, payload); }
  async publishThresholdAlert(sensorId: string, payload: any) { return this.mqtt.publishThresholdAlert(sensorId, payload); }
  async publishBroadcastCritical(message: string, metadata?: any) { return this.mqtt.publishBroadcastCritical(message, metadata); }
  async publishMlEvent(eventType: string, payload: any) { return this.mqtt.publishMlEvent(eventType, payload); }
}
