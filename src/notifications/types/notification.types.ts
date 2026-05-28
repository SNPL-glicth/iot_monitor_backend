export interface PushNotification {
  readonly deviceToken: string;
  readonly title: string;
  readonly body: string;
  readonly data: Record<string, unknown>;
}

export interface EmailNotification {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly html?: string;
}

export interface InAppNotification {
  readonly userId: string;
  readonly title: string;
  readonly message: string;
  readonly type: string;
}

export interface NotificationEvent {
  readonly type: 'push' | 'email' | 'in_app' | 'all';
  readonly pushNotification?: PushNotification;
  readonly emailNotification?: EmailNotification;
  readonly inAppNotification?: InAppNotification;
  readonly userPreferences: NotificationPreferences;
}

export interface NotificationPreferences {
  readonly pushEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly inAppEnabled: boolean;
}

export interface NotificationResult {
  readonly success: boolean;
  readonly channel: string;
  readonly error?: string;
}

export interface RoutingResult {
  readonly successful: string[];
  readonly failed: string[];
}

export const NotificationResult = {
  success(channel: string): NotificationResult {
    return { success: true, channel };
  },
  failed(channel: string, error?: string): NotificationResult {
    return { success: false, channel, error };
  },
};
