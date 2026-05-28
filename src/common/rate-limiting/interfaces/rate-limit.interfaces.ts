export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: Date;
}

export interface IRateLimitStore {
  isAllowed(clientKey: string): RateLimitDecision;
  record(clientKey: string): void;
}

export interface RateLimitConfig {
  readonly windowMs: number;
  readonly maxRequests: number;
}
