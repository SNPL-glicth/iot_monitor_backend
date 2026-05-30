import { Injectable } from '@nestjs/common';
import { IMqttTopicFormatter } from '../interfaces/mqtt-formatter.interface';
import type { MqttConfig } from '../config/mqtt.config';

@Injectable()
export class MqttTopicFormatter implements IMqttTopicFormatter {
  private readonly topicPrefix: string;

  constructor(config: MqttConfig) {
    this.topicPrefix = config.brokerUrl.split('/').pop() ?? 'iot';
  }

  formatSensorReading(deviceId: string, sensorId: string): string {
    return this.buildTopic('devices', deviceId, 'sensors', sensorId, 'reading');
  }

  formatAlert(deviceId: string, severity: string): string {
    return this.buildTopic('devices', deviceId, 'alerts', severity);
  }

  formatHeartbeat(deviceId: string): string {
    return this.buildTopic('devices', deviceId, 'heartbeat');
  }

  private buildTopic(...segments: string[]): string {
    return [this.topicPrefix, ...segments].join('/');
  }
}
