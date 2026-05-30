import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { IPayloadDeduplicator } from '../interfaces/realtime.interfaces';

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

@Injectable()
export class PayloadDeduplicator implements IPayloadDeduplicator {
  private seen: Map<string, number> = new Map();
  private readonly windowMs = 5000;

  isDuplicate(payload: unknown): boolean {
    const hash = createHash('sha256')
      .update(canonicalJson(payload))
      .digest('hex');

    const now = Date.now();
    this.evictStale(now);

    if (this.seen.has(hash)) {
      return true;
    }

    this.seen.set(hash, now);
    return false;
  }

  get cacheSize(): number {
    return this.seen.size;
  }

  private evictStale(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [hash, timestamp] of this.seen.entries()) {
      if (timestamp < cutoff) {
        this.seen.delete(hash);
      }
    }
  }
}
