/// <reference types="jest" />
import { FcmPushService } from './fcm-push.service';

describe('FcmPushService', () => {
  it('returns success on send', async () => {
    const service = new FcmPushService({
      projectId: 'test',
      privateKey: 'key',
      clientEmail: 'test@example.com',
    });
    const result = await service.send({
      deviceToken: 'token',
      title: 'Test',
      body: 'Body',
      data: {},
    });
    expect(result.success).toBe(true);
  });

  it('returns failed on error', async () => {
    const service = new FcmPushService({
      projectId: '',
      privateKey: '',
      clientEmail: '',
    });
    const result = await service.send({
      deviceToken: 'token',
      title: 'Test',
      body: 'Body',
      data: {},
    });
    expect(result.success).toBe(false);
  });
});
