import { Module } from '@nestjs/common';
import { FcmPushService } from './channels/fcm-push.service';
import { SmtpEmailService } from './channels/smtp-email.service';
import { RestEmailService } from './channels/rest-email.service';
import { InAppNotificationService } from './channels/in-app-notification.service';
import { NotificationRouter } from './notification-router';
import { NOTIFICATION_TOKENS } from './tokens/notification.tokens';

@Module({
  providers: [
    {
      provide: NOTIFICATION_TOKENS.FcmPushService,
      useFactory: () => new FcmPushService({
        projectId: process.env.FCM_PROJECT_ID ?? '',
        privateKey: process.env.FCM_PRIVATE_KEY ?? '',
        clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
      }),
    },
    {
      provide: NOTIFICATION_TOKENS.SmtpEmailService,
      useFactory: () => new SmtpEmailService({
        host: process.env.SMTP_HOST ?? '',
        port: Number(process.env.SMTP_PORT ?? '587'),
        user: process.env.SMTP_USER ?? '',
        password: process.env.SMTP_PASSWORD ?? '',
      }),
    },
    {
      provide: NOTIFICATION_TOKENS.RestEmailService,
      useFactory: () => new RestEmailService({
        apiUrl: process.env.REST_EMAIL_API_URL ?? '',
        apiKey: process.env.REST_EMAIL_API_KEY ?? '',
      }),
    },
    {
      provide: NOTIFICATION_TOKENS.InAppNotificationService,
      useFactory: () => new InAppNotificationService({
        save: async () => {},
        updateBadgeCount: async () => {},
      } as any),
    },
    {
      provide: NOTIFICATION_TOKENS.Router,
      useFactory: (
        fcm: FcmPushService,
        smtp: SmtpEmailService,
        rest: RestEmailService,
        inApp: InAppNotificationService,
      ) => new NotificationRouter([fcm, smtp, rest, inApp]),
      inject: [
        NOTIFICATION_TOKENS.FcmPushService,
        NOTIFICATION_TOKENS.SmtpEmailService,
        NOTIFICATION_TOKENS.RestEmailService,
        NOTIFICATION_TOKENS.InAppNotificationService,
      ],
    },
  ],
  exports: [NOTIFICATION_TOKENS.Router],
})
export class NotificationsModule {}
