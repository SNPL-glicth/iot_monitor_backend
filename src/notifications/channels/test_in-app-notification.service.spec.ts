/// <reference types="jest" />
import { InAppNotificationService } from './in-app-notification.service';

describe('InAppNotificationService', () => {
  it('returns success on send', async () => {
    const repo = {
      save: jest.fn().mockResolvedValue(undefined),
      updateBadgeCount: jest.fn().mockResolvedValue(undefined),
    };
    const service = new InAppNotificationService(repo as any);
    const result = await service.send({
      userId: 'u1',
      title: 'Test',
      message: 'Body',
      type: 'info',
    });
    expect(result.success).toBe(true);
    expect(repo.save).toHaveBeenCalled();
  });
});
