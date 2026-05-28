import { Injectable, Logger } from '@nestjs/common';
import type { IMqttConnectionManager, IMqttPublisher } from './interfaces/mqtt.interfaces';
import { BoundedMessageQueue } from './utils/bounded-message-queue';

interface QueuedMessage {
  readonly topic: string;
  readonly payload: string;
}

@Injectable()
export class MqttPublisher implements IMqttPublisher {
  private readonly logger = new Logger(MqttPublisher.name);

  constructor(
    private readonly connectionManager: IMqttConnectionManager,
    private readonly offlineQueue: BoundedMessageQueue<QueuedMessage>,
  ) {
    this.connectionManager.on('connected', () => this.drainOfflineQueue());
  }

  publish(topic: string, payload: unknown): void {
    if (!this.connectionManager.isConnected()) {
      const result = this.offlineQueue.enqueue({
        topic,
        payload: JSON.stringify(payload),
      });
      this.logger.warn(
        `mqtt_offline_queue_full` +
        ` dropped=${result.dropped} size=${result.queueSize}`
      );
      return;
    }

    this.send(topic, JSON.stringify(payload));
  }

  drainOfflineQueue(): void {
    const items = this.offlineQueue.drainAll();
    if (items.length === 0) return;

    this.logger.log(`mqtt_drain_started count=${items.length}`);

    for (const item of items) {
      if (!this.connectionManager.isConnected()) {
        this.offlineQueue.enqueue(item);
        break;
      }
      this.send(item.topic, item.payload);
    }

    this.logger.log('mqtt_drain_complete');
  }

  private send(topic: string, payload: string): void {
    this.logger.debug(`Published to ${topic}`);
  }
}
