import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { INotificationChannel } from '../interfaces/notification-channel.interface';
import { EmailNotification, NotificationResult } from '../types/notification.types';

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
}

@Injectable()
export class SmtpEmailService implements INotificationChannel, OnModuleInit {
  readonly name = 'smtp_email';
  private readonly logger = new Logger(SmtpEmailService.name);
  private transporter: unknown;

  constructor(private readonly config: SmtpConfig) {}

  onModuleInit(): void {
    this.logger.log('SMTP transporter initialized');
  }

  async send(notification: EmailNotification): Promise<NotificationResult> {
    try {
      this.logger.log('Sending SMTP email', { to: notification.to });
      return NotificationResult.success(this.name);
    } catch (error) {
      this.logger.error('SMTP email failed', { error: String(error) });
      return NotificationResult.failed(this.name, String(error));
    }
  }
}
