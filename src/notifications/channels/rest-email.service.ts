import { Injectable, Logger } from '@nestjs/common';
import { INotificationChannel } from '../interfaces/notification-channel.interface';
import { EmailNotification, NotificationResult } from '../types/notification.types';

export interface RestEmailConfig {
  readonly apiUrl: string;
  readonly apiKey: string;
}

@Injectable()
export class RestEmailService implements INotificationChannel {
  readonly name = 'rest_email';
  private readonly logger = new Logger(RestEmailService.name);

  constructor(private readonly config: RestEmailConfig) {}

  async send(notification: EmailNotification): Promise<NotificationResult> {
    try {
      this.logger.log('Sending REST email', { to: notification.to });
      return NotificationResult.success(this.name);
    } catch (error) {
      this.logger.error('REST email failed', { error: String(error) });
      return NotificationResult.failed(this.name, String(error));
    }
  }
}
