/// <reference types="jest" />
import { NotificationRouter } from './notification-router';
import { NotificationResult } from './types/notification.types';

describe('NotificationRouter', () => {
  const mockChannel = (name: string, success: boolean) => ({
    name,
    send: jest.fn().mockResolvedValue(
      success ? NotificationResult.success(name) : NotificationResult.failed(name, 'error')
    ),
  });

  it('routes push event to FCM only', async () => {
    const fcm = mockChannel('fcm_push', true);
    const smtp = mockChannel('smtp_email', true);
    const router = new NotificationRouter([fcm, smtp]);
    const result = await router.route({
      type: 'push',
      userPreferences: { pushEnabled: true, emailEnabled: false, inAppEnabled: false },
      pushNotification: { deviceToken: 't', title: 'T', body: 'B', data: {} },
    });
    expect(result.successful).toContain('fcm_push');
    expect(fcm.send).toHaveBeenCalled();
    expect(smtp.send).not.toHaveBeenCalled();
  });

  it('returns partial result when one channel fails', async () => {
    const fcm = mockChannel('fcm_push', true);
    const smtp = mockChannel('smtp_email', false);
    const router = new NotificationRouter([fcm, smtp]);
    const result = await router.route({
      type: 'all',
      userPreferences: { pushEnabled: true, emailEnabled: true, inAppEnabled: false },
    });
    expect(result.successful).toContain('fcm_push');
    expect(result.failed).toContain('smtp_email');
  });

  it('never throws when all channels fail', async () => {
    const fcm = mockChannel('fcm_push', false);
    const router = new NotificationRouter([fcm]);
    const result = await router.route({
      type: 'push',
      userPreferences: { pushEnabled: true, emailEnabled: false, inAppEnabled: false },
    });
    expect(result.failed).toContain('fcm_push');
    expect(result.successful).toEqual([]);
  });
});
