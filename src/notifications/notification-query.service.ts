import { Injectable } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationQueryService {
  constructor(private readonly notifications: NotificationsService) {}

  async getUnreadNotifications(limit = 100) { return this.notifications.getUnreadNotifications(limit); }
  async markNotificationsAsRead(ids: string[]) { return this.notifications.markNotificationsAsRead(ids); }
  async getAlertRecipients(sensorId: string) { return this.notifications.getAlertRecipients(sensorId); }
}
