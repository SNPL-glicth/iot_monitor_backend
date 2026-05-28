import { Injectable, Logger } from '@nestjs/common';
import { INotificationChannel } from './interfaces/notification-channel.interface';
import {
  NotificationEvent,
  NotificationResult,
  RoutingResult,
} from './types/notification.types';

@Injectable()
export class NotificationRouter {
  private readonly logger = new Logger(NotificationRouter.name);

  constructor(private readonly channels: INotificationChannel[]) {}

  async route(event: NotificationEvent): Promise<RoutingResult> {
    const targets = this.resolveTargets(event);
    const promises = targets.map((channel) => this.dispatch(channel, event));

    const results = await Promise.allSettled(promises);
    const successful: string[] = [];
    const failed: string[] = [];

    results.forEach((result, index) => {
      const name = targets[index].name;
      if (result.status === 'fulfilled' && result.value.success) {
        successful.push(name);
      } else {
        failed.push(name);
      }
    });

    return { successful, failed };
  }

  private resolveTargets(event: NotificationEvent): INotificationChannel[] {
    if (event.type === 'all') {
      return this.channels;
    }
    return this.channels.filter((c) => {
      if (event.type === 'push') return c.name === 'fcm_push';
      if (event.type === 'email') return c.name === 'smtp_email' || c.name === 'rest_email';
      if (event.type === 'in_app') return c.name === 'in_app';
      return false;
    });
  }

  private async dispatch(
    channel: INotificationChannel,
    event: NotificationEvent,
  ): Promise<NotificationResult> {
    try {
      const payload = this.selectPayload(channel.name, event);
      if (!payload) {
        return NotificationResult.failed(channel.name, 'No payload for channel');
      }
      return await channel.send(payload);
    } catch (error) {
      this.logger.error('Channel dispatch failed', {
        channel: channel.name,
        error: String(error),
      });
      return NotificationResult.failed(channel.name, String(error));
    }
  }

  private selectPayload(
    channelName: string,
    event: NotificationEvent,
  ): unknown {
    if (channelName === 'fcm_push') return event.pushNotification;
    if (channelName === 'smtp_email' || channelName === 'rest_email') {
      return event.emailNotification;
    }
    if (channelName === 'in_app') return event.inAppNotification;
    return undefined;
  }
}
