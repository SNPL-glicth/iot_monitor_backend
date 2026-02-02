/**
 * Alert Publisher para MQTT.
 * 
 * Publica alertas y notificaciones a MQTT para entrega instantánea.
 * 
 * CARACTERÍSTICAS:
 * - QoS 1 para garantía de entrega
 * - Idempotencia (sin duplicados)
 * - Persistencia actual intacta (DB sigue siendo SSOT)
 * - HTTP queda como respaldo
 * 
 * TOPICS:
 * - iot/notifications/{userId}/unread
 * - iot/alerts/{sensorId}/threshold
 * - iot/alerts/broadcast/critical
 */

import { Injectable, Logger } from '@nestjs/common';
import { MqttService } from './mqtt.service';

/**
 * Notificación para publicar.
 */
export interface NotificationPayload {
  id: string;
  userId: string;
  source: string;
  severity: string;
  title: string;
  message: string | null;
  sensorId?: string | null;
  sensorName?: string | null;
  deviceName?: string | null;
}

/**
 * Alerta para publicar.
 */
export interface AlertPayload {
  id: string;
  sensorId: string;
  severity: string;
  triggeredValue: number | null;
  thresholdValue?: number | null;
  message: string;
  deviceId?: string;
  deviceName?: string;
  sensorName?: string;
}

/**
 * Evento ML para publicar.
 */
export interface MlEventPayload {
  id: string;
  sensorId: string;
  eventType: string;
  severity: string;
  message: string;
  value?: number | null;
  deviceId?: string;
}

@Injectable()
export class AlertPublisher {
  private readonly logger = new Logger(AlertPublisher.name);

  constructor(private readonly mqttService: MqttService) {}

  /**
   * Publica notificación a un usuario.
   * 
   * Llamar después de crear la notificación en DB.
   * La DB sigue siendo SSOT, MQTT es solo para entrega instantánea.
   */
  async publishNotification(notification: NotificationPayload): Promise<boolean> {
    if (!this.mqttService.isEnabled) {
      return false;
    }

    try {
      const success = await this.mqttService.publishNotification(
        notification.userId,
        {
          id: notification.id,
          source: notification.source,
          severity: notification.severity,
          title: notification.title,
          message: notification.message,
          sensorId: notification.sensorId,
          sensorName: notification.sensorName,
          deviceName: notification.deviceName,
        },
      );

      if (success) {
        this.logger.debug(`Published notification ${notification.id} to user ${notification.userId}`);
      }

      return success;
    } catch (err) {
      this.logger.error(`Failed to publish notification: ${err}`);
      return false;
    }
  }

  /**
   * Publica notificaciones a múltiples usuarios.
   * 
   * Útil cuando una alerta afecta a varios usuarios asociados a un dispositivo.
   */
  async publishNotificationToUsers(
    userIds: string[],
    notification: Omit<NotificationPayload, 'userId'>,
  ): Promise<number> {
    let published = 0;

    for (const userId of userIds) {
      const success = await this.publishNotification({
        ...notification,
        userId,
      });
      if (success) published++;
    }

    return published;
  }

  /**
   * Publica alerta de umbral.
   * 
   * Llamar después de crear/actualizar la alerta en DB.
   */
  async publishThresholdAlert(alert: AlertPayload): Promise<boolean> {
    if (!this.mqttService.isEnabled) {
      return false;
    }

    try {
      const success = await this.mqttService.publishThresholdAlert(
        alert.sensorId,
        {
          id: alert.id,
          severity: alert.severity,
          triggeredValue: alert.triggeredValue,
          thresholdValue: alert.thresholdValue ?? null,
          message: alert.message,
          deviceId: alert.deviceId,
          deviceName: alert.deviceName,
          sensorName: alert.sensorName,
        },
      );

      if (success) {
        this.logger.debug(`Published threshold alert ${alert.id} for sensor ${alert.sensorId}`);
      }

      return success;
    } catch (err) {
      this.logger.error(`Failed to publish threshold alert: ${err}`);
      return false;
    }
  }

  /**
   * Publica alerta crítica a broadcast.
   * 
   * Todos los clientes suscritos a iot/alerts/broadcast/critical recibirán.
   */
  async publishCriticalBroadcast(alert: AlertPayload): Promise<boolean> {
    if (!this.mqttService.isEnabled) {
      return false;
    }

    if (alert.severity !== 'critical') {
      return false;
    }

    try {
      const success = await this.mqttService.publishBroadcastCritical(
        alert.sensorId,
        {
          id: alert.id,
          severity: alert.severity,
          triggeredValue: alert.triggeredValue,
          message: alert.message,
          deviceId: alert.deviceId,
          deviceName: alert.deviceName,
          sensorName: alert.sensorName,
        },
      );

      if (success) {
        this.logger.log(`Published CRITICAL broadcast for alert ${alert.id}`);
      }

      return success;
    } catch (err) {
      this.logger.error(`Failed to publish critical broadcast: ${err}`);
      return false;
    }
  }

  /**
   * Publica evento ML.
   */
  async publishMlEvent(event: MlEventPayload): Promise<boolean> {
    if (!this.mqttService.isEnabled) {
      return false;
    }

    try {
      const success = await this.mqttService.publishMlEvent(
        event.sensorId,
        {
          id: event.id,
          eventType: event.eventType,
          severity: event.severity,
          message: event.message,
          value: event.value,
          deviceId: event.deviceId,
        },
      );

      if (success) {
        this.logger.debug(`Published ML event ${event.id} for sensor ${event.sensorId}`);
      }

      return success;
    } catch (err) {
      this.logger.error(`Failed to publish ML event: ${err}`);
      return false;
    }
  }

  /**
   * Indica si MQTT está habilitado.
   */
  get isEnabled(): boolean {
    return this.mqttService.isEnabled;
  }

  /**
   * Indica si MQTT está listo para publicar.
   */
  get isReady(): boolean {
    return this.mqttService.isReady;
  }
}
