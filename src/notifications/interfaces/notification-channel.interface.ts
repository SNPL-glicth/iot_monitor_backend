import { NotificationResult } from '../types/notification.types';

export interface INotificationChannel {
  readonly name: string;
  send(notification: unknown): Promise<NotificationResult>;
}
