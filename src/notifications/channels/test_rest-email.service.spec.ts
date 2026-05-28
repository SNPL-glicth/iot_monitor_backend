/// <reference types="jest" />
import { RestEmailService } from './rest-email.service';

describe('RestEmailService', () => {
  it('returns success on send', async () => {
    const service = new RestEmailService({
      apiUrl: 'https://api.example.com',
      apiKey: 'key',
    });
    const result = await service.send({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Body',
    });
    expect(result.success).toBe(true);
  });
});
