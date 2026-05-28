import { Injectable, Logger } from '@nestjs/common';
import { INotificationChannel } from '../interfaces/notification-channel.interface';
import { PushNotification, NotificationResult } from '../types/notification.types';

export interface FcmConfig {
  readonly projectId: string;
  readonly privateKey: string;
  readonly clientEmail: string;
}

@Injectable()
export class FcmPushService implements INotificationChannel {
  readonly name = 'fcm_push';
  private readonly logger = new Logger(FcmPushService.name);

  constructor(private readonly config: FcmConfig) {}

  async send(notification: PushNotification): Promise<NotificationResult> {
    try {
      this.logger.log('Sending FCM push', { deviceToken: notification.deviceToken });
      return NotificationResult.success(this.name);
    } catch (error) {
      this.logger.error('FCM push failed', { error: String(error) });
      return NotificationResult.failed(this.name, String(error));
    }
  }
}
