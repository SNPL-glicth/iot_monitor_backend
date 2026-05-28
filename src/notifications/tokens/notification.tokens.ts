export const NOTIFICATION_TOKENS = {
  FcmPushService: Symbol('FcmPushService'),
  SmtpEmailService: Symbol('SmtpEmailService'),
  RestEmailService: Symbol('RestEmailService'),
  InAppNotificationService: Symbol('InAppNotificationService'),
  Router: Symbol('NotificationRouter'),
} as const;
