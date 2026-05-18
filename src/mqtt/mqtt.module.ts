/**
 * MQTT Module para NestJS.
 * 
 * Proporciona servicios MQTT para:
 * - Publicación de alertas en tiempo real
 * - Notificaciones push instantáneas
 * - Broadcast de alertas críticas
 * 
 * Topics:
 * - iot/notifications/{userId}/unread
 * - iot/alerts/{sensorId}/threshold
 * - iot/alerts/broadcast/critical
 */

import { Module, Global } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { MqttPublisherService } from './mqtt-publisher.service';
import { MqttSubscriptionService } from './mqtt-subscription.service';
import { AlertPublisher } from './alert.publisher';

@Global()
@Module({
  providers: [MqttService, MqttPublisherService, MqttSubscriptionService, AlertPublisher],
  exports: [MqttService, MqttPublisherService, MqttSubscriptionService, AlertPublisher],
})
export class MqttModule {}
