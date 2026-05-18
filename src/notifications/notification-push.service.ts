import { Injectable } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationPushService {
  constructor(private readonly notifications: NotificationsService) {}

  async registerDevice(userId: string, dto: any) { return this.notifications.registerDevice(userId, dto); }
  async sendAlertNotification(alertId: string) { return this.notifications.sendAlertNotification(alertId); }
  async sendCriticalAlertNotification(alertId: string) { return this.notifications.sendCriticalAlertNotification(alertId); }
  async sendDecisionNotification(deviceId: string, title: string, body: string, decisionId?: string) { return this.notifications.sendDecisionNotification(deviceId, title, body, decisionId); }
}
