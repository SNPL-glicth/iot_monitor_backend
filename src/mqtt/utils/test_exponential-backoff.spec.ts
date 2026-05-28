/// <reference types="jest" />
import { ExponentialBackoff } from './exponential-backoff';

describe('ExponentialBackoff', () => {
  it('doubles each call up to maxMs', () => {
    const backoff = new ExponentialBackoff(1000, 10000);
    const d1 = backoff.next();
    const d2 = backoff.next();
    expect(d2).toBeGreaterThanOrEqual(d1 * 1.5);
    expect(d2).toBeLessThanOrEqual(10000);
  });

  it('reset returns to baseMs', () => {
    const backoff = new ExponentialBackoff(1000, 10000);
    backoff.next();
    backoff.next();
    backoff.reset();
    expect(backoff.currentDelayMs).toBe(1000);
  });

  it('jitter stays within ten percent', () => {
    const backoff = new ExponentialBackoff(1000, 10000);
    for (let i = 0; i < 10; i++) {
      const d = backoff.next();
      expect(d).toBeGreaterThanOrEqual(900);
      expect(d).toBeLessThanOrEqual(1100);
      backoff.reset();
    }
  });
});
