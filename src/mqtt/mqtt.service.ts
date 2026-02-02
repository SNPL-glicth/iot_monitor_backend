/**
 * MQTT Service para NestJS.
 * 
 * Gestiona conexión MQTT y publicación de mensajes.
 * 
 * CARACTERÍSTICAS:
 * - Reconexión automática
 * - QoS 1 para notificaciones (garantía de entrega)
 * - Idempotencia via msgId
 * - Logs estructurados
 * 
 * TOPICS:
 * - iot/notifications/{userId}/unread - Notificaciones de usuario
 * - iot/alerts/{sensorId}/threshold - Alertas de umbral
 * - iot/alerts/broadcast/critical - Alertas críticas broadcast
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as mqtt from 'mqtt';

// Configuración desde env
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || `backend-${Date.now()}`;
const MQTT_TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'iot';
const MQTT_ENABLED = process.env.FF_MQTT_NOTIFICATIONS_ENABLED === 'true';
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

/**
 * Mensaje MQTT unificado del sistema IoT.
 */
export interface MqttMessage {
  v: 1;
  msgId: string;
  sensorId: string | null;
  value: number | null;
  timestamp: string;
  type: 'alert' | 'notification' | 'ml_event';
  metadata: Record<string, unknown>;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient | null = null;
  private connected = false;
  private readonly enabled: boolean;
  
  // Estadísticas
  private messagesSent = 0;
  private messagesFailed = 0;
  
  // Deduplicación: evitar publicar el mismo mensaje múltiples veces
  private readonly publishedIds = new Set<string>();
  private readonly maxPublishedIds = 10000;

  constructor() {
    this.enabled = MQTT_ENABLED;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('MQTT notifications disabled (FF_MQTT_NOTIFICATIONS_ENABLED=false)');
      return;
    }

    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.disconnect();
  }

  /**
   * Conecta al broker MQTT.
   */
  private async connect(): Promise<void> {
    if (this.client) return;

    try {
      this.logger.log(`Connecting to MQTT broker: ${MQTT_BROKER_URL}`);

      const options: mqtt.IClientOptions = {
        clientId: MQTT_CLIENT_ID,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
      };

      if (MQTT_USERNAME) {
        options.username = MQTT_USERNAME;
        options.password = MQTT_PASSWORD;
      }

      this.client = mqtt.connect(MQTT_BROKER_URL, options);

      this.client.on('connect', () => {
        this.connected = true;
        this.logger.log('Connected to MQTT broker');
      });

      this.client.on('error', (err) => {
        this.logger.error(`MQTT error: ${err.message}`);
      });

      this.client.on('close', () => {
        this.connected = false;
        this.logger.warn('MQTT connection closed');
      });

      this.client.on('reconnect', () => {
        this.logger.log('Reconnecting to MQTT broker...');
      });

    } catch (err) {
      this.logger.error(`Failed to connect to MQTT: ${err}`);
    }
  }

  /**
   * Desconecta del broker.
   */
  private disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.connected = false;
      this.logger.log('Disconnected from MQTT broker');
    }
  }

  /**
   * Indica si está habilitado y conectado.
   */
  get isReady(): boolean {
    return this.enabled && this.connected;
  }

  /**
   * Indica si MQTT está habilitado.
   */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Publica notificación a un usuario.
   * 
   * Topic: iot/notifications/{userId}/unread
   * QoS: 1 (garantía de entrega)
   */
  async publishNotification(
    userId: string,
    notification: {
      id: string;
      source: string;
      severity: string;
      title: string;
      message: string | null;
      sensorId?: string | null;
      sensorName?: string | null;
      deviceName?: string | null;
    },
  ): Promise<boolean> {
    if (!this.isReady) return false;

    const msgId = `notif-${notification.id}-${Date.now()}`;
    
    // Idempotencia: no publicar duplicados
    if (this.publishedIds.has(notification.id)) {
      this.logger.debug(`Notification ${notification.id} already published, skipping`);
      return true;
    }

    const topic = `${MQTT_TOPIC_PREFIX}/notifications/${userId}/unread`;
    
    const message: MqttMessage = {
      v: 1,
      msgId,
      sensorId: notification.sensorId ?? null,
      value: null,
      timestamp: new Date().toISOString(),
      type: 'notification',
      metadata: {
        notificationId: notification.id,
        source: notification.source,
        severity: notification.severity,
        title: notification.title,
        message: notification.message,
        sensorName: notification.sensorName,
        deviceName: notification.deviceName,
      },
    };

    return this.publish(topic, message, 1);
  }

  /**
   * Publica alerta de umbral.
   * 
   * Topic: iot/alerts/{sensorId}/threshold
   * QoS: 1 (garantía de entrega)
   */
  async publishThresholdAlert(
    sensorId: string,
    alert: {
      id: string;
      severity: string;
      triggeredValue: number | null;
      thresholdValue: number | null;
      message: string;
      deviceId?: string;
      deviceName?: string;
      sensorName?: string;
    },
  ): Promise<boolean> {
    if (!this.isReady) return false;

    const msgId = `alert-${alert.id}-${Date.now()}`;
    
    // Idempotencia
    if (this.publishedIds.has(alert.id)) {
      return true;
    }

    const topic = `${MQTT_TOPIC_PREFIX}/alerts/${sensorId}/threshold`;
    
    const message: MqttMessage = {
      v: 1,
      msgId,
      sensorId,
      value: alert.triggeredValue,
      timestamp: new Date().toISOString(),
      type: 'alert',
      metadata: {
        alertId: alert.id,
        severity: alert.severity,
        thresholdValue: alert.thresholdValue,
        message: alert.message,
        deviceId: alert.deviceId,
        deviceName: alert.deviceName,
        sensorName: alert.sensorName,
      },
    };

    // Si es crítica, también publicar a broadcast
    if (alert.severity === 'critical') {
      await this.publishBroadcastCritical(sensorId, alert);
    }

    return this.publish(topic, message, 1);
  }

  /**
   * Publica alerta crítica a broadcast.
   * 
   * Topic: iot/alerts/broadcast/critical
   * QoS: 1 (garantía de entrega)
   */
  async publishBroadcastCritical(
    sensorId: string,
    alert: {
      id: string;
      severity: string;
      triggeredValue: number | null;
      message: string;
      deviceId?: string;
      deviceName?: string;
      sensorName?: string;
    },
  ): Promise<boolean> {
    if (!this.isReady) return false;

    const msgId = `broadcast-${alert.id}-${Date.now()}`;
    const topic = `${MQTT_TOPIC_PREFIX}/alerts/broadcast/critical`;
    
    const message: MqttMessage = {
      v: 1,
      msgId,
      sensorId,
      value: alert.triggeredValue,
      timestamp: new Date().toISOString(),
      type: 'alert',
      metadata: {
        alertId: alert.id,
        severity: 'critical',
        message: alert.message,
        deviceId: alert.deviceId,
        deviceName: alert.deviceName,
        sensorName: alert.sensorName,
        broadcast: true,
      },
    };

    return this.publish(topic, message, 1);
  }

  /**
   * Publica evento ML.
   * 
   * Topic: iot/alerts/{sensorId}/ml
   * QoS: 1
   */
  async publishMlEvent(
    sensorId: string,
    event: {
      id: string;
      eventType: string;
      severity: string;
      message: string;
      value?: number | null;
      deviceId?: string;
    },
  ): Promise<boolean> {
    if (!this.isReady) return false;

    const msgId = `ml-${event.id}-${Date.now()}`;
    
    if (this.publishedIds.has(event.id)) {
      return true;
    }

    const topic = `${MQTT_TOPIC_PREFIX}/alerts/${sensorId}/ml`;
    
    const message: MqttMessage = {
      v: 1,
      msgId,
      sensorId,
      value: event.value ?? null,
      timestamp: new Date().toISOString(),
      type: 'ml_event',
      metadata: {
        eventId: event.id,
        eventType: event.eventType,
        severity: event.severity,
        message: event.message,
        deviceId: event.deviceId,
      },
    };

    return this.publish(topic, message, 1);
  }

  /**
   * Publica mensaje a un topic.
   */
  private publish(topic: string, message: MqttMessage, qos: 0 | 1 | 2 = 1): boolean {
    if (!this.client || !this.connected) {
      return false;
    }

    try {
      const payload = JSON.stringify(message);

      this.client.publish(topic, payload, { qos }, (err) => {
        if (err) {
          this.messagesFailed++;
          this.logger.error(`Publish failed to ${topic}: ${err.message}`);
        } else {
          this.messagesSent++;
          // Marcar como publicado para idempotencia
          this.markPublished(message.msgId);
          this.logger.debug(`Published to ${topic}: ${message.msgId}`);
        }
      });

      return true;

    } catch (err) {
      this.messagesFailed++;
      this.logger.error(`Publish error: ${err}`);
      return false;
    }
  }

  /**
   * Marca mensaje como publicado para idempotencia.
   */
  private markPublished(msgId: string): void {
    this.publishedIds.add(msgId);
    
    // Limpiar IDs viejos para evitar memory leak
    if (this.publishedIds.size > this.maxPublishedIds) {
      const toDelete = Array.from(this.publishedIds).slice(0, this.maxPublishedIds / 2);
      toDelete.forEach((id) => this.publishedIds.delete(id));
    }
  }

  /**
   * Estadísticas del servicio.
   */
  get stats(): {
    enabled: boolean;
    connected: boolean;
    messagesSent: number;
    messagesFailed: number;
  } {
    return {
      enabled: this.enabled,
      connected: this.connected,
      messagesSent: this.messagesSent,
      messagesFailed: this.messagesFailed,
    };
  }
}
