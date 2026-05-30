import { IRateLimitStore, RateLimitDecision, RateLimitConfig } from './interfaces/rate-limit.interfaces';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export class RateLimitStore implements IRateLimitStore {
  protected readonly state = new Map<string, RateLimitEntry>();
  protected lastPrune = Date.now();

  constructor(
    private readonly config: RateLimitConfig,
    private readonly pruneIntervalMs: number = 60000,
  ) {}

  isAllowed(clientKey: string): RateLimitDecision {
    this.pruneIfNeeded();

    const now = Date.now();
    const entry = this.state.get(clientKey);

    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      return { allowed: true, remaining: this.config.maxRequests - 1, resetAt: new Date(now + this.config.windowMs) };
    }

    if (entry.count >= this.config.maxRequests) {
      const resetAt = new Date(entry.windowStart + this.config.windowMs);
      return { allowed: false, remaining: 0, resetAt };
    }

    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count - 1,
      resetAt: new Date(entry.windowStart + this.config.windowMs),
    };
  }

  record(clientKey: string): void {
    const now = Date.now();
    const entry = this.state.get(clientKey);

    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      this.state.set(clientKey, { count: 1, windowStart: now });
    } else {
      entry.count++;
    }
  }

  reset(clientKey: string): void {
    this.state.delete(clientKey);
  }

  private pruneIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastPrune < this.pruneIntervalMs) {
      return;
    }
    this.lastPrune = now;

    const cutoff = now - this.config.windowMs * 2;
    for (const [key, entry] of this.state.entries()) {
      if (entry.windowStart < cutoff) {
        this.state.delete(key);
      }
    }
  }
}
