import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPushService } from './notification-push.service';
import { NotificationsService } from './notifications.service';

const mockNotifications = () => ({
  registerDevice: jest.fn(),
  sendAlertNotification: jest.fn(),
  sendCriticalAlertNotification: jest.fn(),
  sendDecisionNotification: jest.fn(),
});

describe('NotificationPushService', () => {
  let service: NotificationPushService;
  let notifications: ReturnType<typeof mockNotifications>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPushService,
        { provide: NotificationsService, useFactory: mockNotifications },
      ],
    }).compile();

    service = module.get<NotificationPushService>(NotificationPushService);
    notifications = module.get(NotificationsService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('delega registerDevice al NotificationsService', async () => {
    notifications.registerDevice.mockResolvedValue(undefined);
    await service.registerDevice('user-1', { token: 'abc123', platform: 'android' });
    expect(notifications.registerDevice).toHaveBeenCalledWith('user-1', { token: 'abc123', platform: 'android' });
  });

  it('delega sendAlertNotification al NotificationsService', async () => {
    notifications.sendAlertNotification.mockResolvedValue(undefined);
    await service.sendAlertNotification('alert-1');
    expect(notifications.sendAlertNotification).toHaveBeenCalledWith('alert-1');
  });

  it('delega sendCriticalAlertNotification al NotificationsService', async () => {
    notifications.sendCriticalAlertNotification.mockResolvedValue(undefined);
    await service.sendCriticalAlertNotification('alert-2');
    expect(notifications.sendCriticalAlertNotification).toHaveBeenCalledWith('alert-2');
  });

  it('delega sendDecisionNotification con todos los parametros', async () => {
    notifications.sendDecisionNotification.mockResolvedValue(undefined);
    await service.sendDecisionNotification('device-1', 'Titulo', 'Cuerpo', 'decision-1');
    expect(notifications.sendDecisionNotification).toHaveBeenCalledWith('device-1', 'Titulo', 'Cuerpo', 'decision-1');
  });
});
