import { Injectable, Inject, Logger } from '@nestjs/common';
import type { IMqttPublisher } from './interfaces/mqtt.interfaces';
import type { IMqttTopicFormatter } from './interfaces/mqtt-formatter.interface';
import type { IMqttStatisticsTracker } from './interfaces/mqtt-statistics.interface';
import { MQTT_TOKENS } from './tokens/mqtt.tokens';

@Injectable()
export class MqttService {
  private readonly logger = new Logger(MqttService.name);

  constructor(
    @Inject(MQTT_TOKENS.Publisher)
    private readonly publisher: IMqttPublisher,
    @Inject(MQTT_TOKENS.TopicFormatter)
    private readonly topicFormatter: IMqttTopicFormatter,
    @Inject(MQTT_TOKENS.StatisticsTracker)
    private readonly statistics: IMqttStatisticsTracker,
  ) {}

  publishSensorReading(
    deviceId: string,
    sensorId: string,
    payload: unknown,
  ): void {
    const topic = this.topicFormatter.formatSensorReading(deviceId, sensorId);
    this.publisher.publish(topic, payload);
    this.statistics.recordPublish();
  }

  publishAlert(
    deviceId: string,
    severity: string,
    payload: unknown,
  ): void {
    const topic = this.topicFormatter.formatAlert(deviceId, severity);
    this.publisher.publish(topic, payload);
    this.statistics.recordPublish();
  }

  getStatistics() {
    return this.statistics.getSnapshot();
  }
}
