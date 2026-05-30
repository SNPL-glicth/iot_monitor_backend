import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { IMqttPublisher } from './interfaces/mqtt.interfaces';
import type { IMqttTopicFormatter } from './interfaces/mqtt-formatter.interface';
import type { IMqttStatisticsTracker } from './interfaces/mqtt-statistics.interface';
import { MQTT_TOKENS } from './tokens/mqtt.tokens';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private _enabled = true;

  constructor(
    @Inject(MQTT_TOKENS.Publisher)
    private readonly publisher: IMqttPublisher,
    @Inject(MQTT_TOKENS.TopicFormatter)
    private readonly topicFormatter: IMqttTopicFormatter,
    @Inject(MQTT_TOKENS.StatisticsTracker)
    private readonly statistics: IMqttStatisticsTracker,
  ) {}

  get isEnabled(): boolean {
    return this._enabled;
  }

  get isReady(): boolean {
    return this._enabled;
  }

  onModuleInit(): void {
    this.logger.log('MqttService initialized');
  }

  onModuleDestroy(): void {
    this.logger.log('MqttService destroyed');
  }

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

  async publishNotification(userId: string, payload: unknown): Promise<boolean> {
    const topic = `iot/notifications/${userId}/unread`;
    this.publisher.publish(topic, payload);
    this.statistics.recordPublish();
    return true;
  }

  async publishThresholdAlert(sensorId: string, payload: unknown): Promise<boolean> {
    const topic = `iot/alerts/${sensorId}/threshold`;
    this.publisher.publish(topic, payload);
    this.statistics.recordPublish();
    return true;
  }

  async publishBroadcastCritical(message: string, metadata?: unknown): Promise<boolean> {
    const topic = 'iot/alerts/broadcast/critical';
    this.publisher.publish(topic, { message, metadata });
    this.statistics.recordPublish();
    return true;
  }

  async publishMlEvent(eventType: string, payload: unknown): Promise<boolean> {
    const topic = `iot/ml/events/${eventType}`;
    this.publisher.publish(topic, payload);
    this.statistics.recordPublish();
    return true;
  }

  getStatistics() {
    return this.statistics.getSnapshot();
  }
}
