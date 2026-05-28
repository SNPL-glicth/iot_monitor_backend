import { Injectable } from '@nestjs/common';
import { IMqttStatisticsTracker, MqttStatsSnapshot } from '../interfaces/mqtt-statistics.interface';

@Injectable()
export class MqttStatisticsTracker implements IMqttStatisticsTracker {
  private messagesPublished = 0;
  private messagesDropped = 0;
  private reconnectCount = 0;
  private lastConnectedAt: Date | null = null;
  private currentOfflineQueueSize = 0;

  recordPublish(): void {
    this.messagesPublished++;
  }

  recordDrop(): void {
    this.messagesDropped++;
  }

  recordReconnect(): void {
    this.reconnectCount++;
    this.lastConnectedAt = new Date();
  }

  updateQueueSize(size: number): void {
    this.currentOfflineQueueSize = size;
  }

  getSnapshot(): MqttStatsSnapshot {
    return Object.freeze({
      messagesPublished: this.messagesPublished,
      messagesDropped: this.messagesDropped,
      reconnectCount: this.reconnectCount,
      lastConnectedAt: this.lastConnectedAt,
      currentOfflineQueueSize: this.currentOfflineQueueSize,
    });
  }
}
