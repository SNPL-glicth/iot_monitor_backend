import { Injectable, Logger } from '@nestjs/common';
import { INotificationChannel } from '../interfaces/notification-channel.interface';
import { InAppNotification, NotificationResult } from '../types/notification.types';

export interface INotificationRepository {
  save(notification: InAppNotification): Promise<void>;
  updateBadgeCount(userId: string, count: number): Promise<void>;
}

@Injectable()
export class InAppNotificationService implements INotificationChannel {
  readonly name = 'in_app';
  private readonly logger = new Logger(InAppNotificationService.name);

  constructor(private readonly repository: INotificationRepository) {}

  async send(notification: InAppNotification): Promise<NotificationResult> {
    try {
      await this.repository.save(notification);
      return NotificationResult.success(this.name);
    } catch (error) {
      this.logger.error('In-app notification failed', { error: String(error) });
      return NotificationResult.failed(this.name, String(error));
    }
  }

  async updateBadgeCount(userId: string, count: number): Promise<void> {
    await this.repository.updateBadgeCount(userId, count);
  }
}
