import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { MqttConfig } from './config/mqtt.config';
import { ExponentialBackoff } from './utils/exponential-backoff';
import { IMqttConnectionManager } from './interfaces/mqtt.interfaces';

@Injectable()
export class MqttConnectionManager implements OnModuleInit, OnModuleDestroy, IMqttConnectionManager {
  private readonly logger = new Logger(MqttConnectionManager.name);
  private client: mqtt.MqttClient | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private listeners: { connected: (() => void)[]; disconnected: (() => void)[] } = {
    connected: [],
    disconnected: [],
  };

  constructor(
    private readonly config: MqttConfig,
    private readonly backoff: ExponentialBackoff,
  ) {}

  onModuleInit(): void {
    this.connect();
  }

  onModuleDestroy(): void {
    this.clearReconnectTimer();
    this.disconnect();
  }

  isConnected(): boolean {
    return this.connected;
  }

  on(event: 'connected' | 'disconnected', listener: () => void): void {
    this.listeners[event].push(listener);
  }

  async connect(): Promise<void> {
    if (this.client) return;

    const options: mqtt.IClientOptions = {
      clientId: this.config.clientId,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 10000,
    };

    if (this.config.username) {
      options.username = this.config.username;
      options.password = this.config.password;
    }

    this.client = mqtt.connect(this.config.brokerUrl, options);

    this.client.on('connect', () => this.handleConnect());
    this.client.on('close', () => this.handleDisconnect());
    this.client.on('error', (err) => this.handleError(err));
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.connected = false;
    }
  }

  private handleConnect(): void {
    this.connected = true;
    this.backoff.reset();
    this.clearReconnectTimer();
    this.logger.log('Connected to MQTT broker');
    this.emit('connected');
  }

  private handleDisconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.logger.warn('MQTT connection closed');
    this.emit('disconnected');
    this.scheduleReconnect();
  }

  private handleError(err: Error): void {
    this.logger.error(`MQTT error: ${err.message}`);
    if (!this.connected) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = this.backoff.next();
    this.logger.warn(`Scheduling MQTT reconnect in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.client = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emit(event: 'connected' | 'disconnected'): void {
    for (const listener of this.listeners[event]) {
      listener();
    }
  }
}
