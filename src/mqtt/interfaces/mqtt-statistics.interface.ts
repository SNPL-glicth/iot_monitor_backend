export interface MqttStatsSnapshot {
  readonly messagesPublished: number;
  readonly messagesDropped: number;
  readonly reconnectCount: number;
  readonly lastConnectedAt: Date | null;
  readonly currentOfflineQueueSize: number;
}

export interface IMqttStatisticsTracker {
  recordPublish(): void;
  recordDrop(): void;
  recordReconnect(): void;
  getSnapshot(): MqttStatsSnapshot;
}
