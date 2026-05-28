/// <reference types="jest" />
import { SmtpEmailService } from './smtp-email.service';

describe('SmtpEmailService', () => {
  it('returns success on send', async () => {
    const service = new SmtpEmailService({
      host: 'smtp.example.com',
      port: 587,
      user: 'user',
      password: 'pass',
    });
    const result = await service.send({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Body',
    });
    expect(result.success).toBe(true);
  });
});
