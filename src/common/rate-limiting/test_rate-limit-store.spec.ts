/// <reference types="jest" />
import { RateLimitStore } from './rate-limit-store';

describe('RateLimitStore', () => {
  it('allows requests under limit', () => {
    const store = new RateLimitStore({ windowMs: 60000, maxRequests: 2 });
    expect(store.isAllowed('a').allowed).toBe(true);
    store.record('a');
    expect(store.isAllowed('a').allowed).toBe(true);
  });

  it('blocks requests over limit', () => {
    const store = new RateLimitStore({ windowMs: 60000, maxRequests: 1 });
    store.record('a');
    expect(store.isAllowed('a').allowed).toBe(false);
  });

  it('prunes expired entries', () => {
    const store = new RateLimitStore({ windowMs: 1, maxRequests: 1 });
    store.record('a');
    expect(store.isAllowed('a').allowed).toBe(false);
    setTimeout(() => {
      expect(store.isAllowed('a').allowed).toBe(true);
    }, 10);
  });
});
