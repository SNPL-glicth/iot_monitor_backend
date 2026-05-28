/// <reference types="jest" />
import { PayloadDeduplicator } from './payload-deduplicator';

describe('PayloadDeduplicator', () => {
  it('returns false for first occurrence', () => {
    const dedup = new PayloadDeduplicator(1000);
    expect(dedup.isDuplicate({ a: 1 })).toBe(false);
  });

  it('returns true within windowMs', () => {
    const dedup = new PayloadDeduplicator(1000);
    dedup.isDuplicate({ a: 1 });
    expect(dedup.isDuplicate({ a: 1 })).toBe(true);
  });

  it('returns false after windowMs expires', (done) => {
    const dedup = new PayloadDeduplicator(50);
    dedup.isDuplicate({ a: 1 });
    setTimeout(() => {
      expect(dedup.isDuplicate({ a: 1 })).toBe(false);
      done();
    }, 100);
  });

  it('evicts stale entries', () => {
    const dedup = new PayloadDeduplicator(1000);
    dedup.isDuplicate({ a: 1 });
    dedup.isDuplicate({ b: 2 });
    expect(dedup.cacheSize).toBe(2);
  });
});
