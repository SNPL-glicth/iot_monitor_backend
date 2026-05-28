export interface IMqttConnectionManager {
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): void;
  on(event: 'connected' | 'disconnected', listener: () => void): void;
}

export interface IMqttPublisher {
  publish(topic: string, payload: unknown): void;
  drainOfflineQueue(): void;
}

export interface MqttMessage {
  readonly v: 1;
  readonly msgId: string;
  readonly sensorId: string | null;
  readonly value: number | null;
  readonly timestamp: string;
  readonly type: 'alert' | 'notification' | 'ml_event';
  readonly metadata: Record<string, unknown>;
}
