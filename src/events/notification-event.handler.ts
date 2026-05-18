/**
 * Notification Event Handler
 * 
 * BUG-2 FIX: Broadcasts events to WebSocket for real-time notifications
 * Replaces polling of /notifications/unread
 * 
 * Subscribes to existing events (AlertCreatedEvent, AnomalyDetectedEvent)
 * and broadcasts them via WebSocket to the 'alerts/active' channel.
 */

import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AlertCreatedEvent, AnomalyDetectedEvent } from './domain-event';

interface NotificationBroadcastPayload {
  event: 'notification';
  type: 'alert' | 'anomaly';
  data: any;
  timestamp: string;
}

@Injectable()
export class NotificationEventHandler {
  private readonly logger = new Logger(NotificationEventHandler.name);

  constructor(
    private readonly gateway: RealtimeGateway,
  ) {}

  /**
   * Handle AlertCreatedEvent and broadcast via WebSocket
   */
  handleAlertCreated(event: AlertCreatedEvent): void {
    try {
      this.logger.log(`Broadcasting alert.created event: ${event.payload.alertId}`);
      
      const payload: NotificationBroadcastPayload = {
        event: 'notification',
        type: 'alert',
        data: {
          id: event.payload.alertId,
          sensorId: event.payload.sensorId,
          deviceId: event.payload.deviceId,
          severity: event.payload.severity,
          status: event.payload.status,
          triggeredValue: event.payload.triggeredValue,
          message: event.payload.message,
        },
        timestamp: event.timestamp.toISOString(),
      };

      // Use existing 'alerts/active' channel instead of 'notifications'
      this.gateway.broadcast('alerts/active', payload);
    } catch (error) {
      this.logger.error(`Error broadcasting alert.created event: ${error}`);
    }
  }

  /**
   * Handle AnomalyDetectedEvent and broadcast via WebSocket
   */
  handleAnomalyDetected(event: AnomalyDetectedEvent): void {
    try {
      this.logger.log(`Broadcasting anomaly.detected.v1 event: ${event.payload.sensorId}`);
      
      const payload: NotificationBroadcastPayload = {
        event: 'notification',
        type: 'anomaly',
        data: {
          id: event.payload.idempotencyKey,
          sensorId: event.payload.sensorId,
          deviceId: event.payload.deviceId,
          eventCode: event.payload.eventCode,
          eventType: event.payload.eventType,
          detectedAt: event.payload.detectedAt,
          value: event.payload.value,
          anomalyScore: event.payload.anomalyScore,
          source: event.payload.source,
          reason: event.payload.reason,
        },
        timestamp: event.timestamp.toISOString(),
      };

      // Use existing 'ml/events/active' channel instead of 'notifications'
      this.gateway.broadcast('ml/events/active', payload);
    } catch (error) {
      this.logger.error(`Error broadcasting anomaly.detected.v1 event: ${error}`);
    }
  }
}
