import { createHash, randomBytes } from 'crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Minimal duration parser for values like: 15m, 4h, 30d, 60s.
export function durationToMs(input: string, fallbackMs: number): number {
  if (!input) return fallbackMs;
  const raw = String(input).trim();
  const m = raw.match(/^([0-9]+)\s*([smhd])$/i);
  if (!m) return fallbackMs;

  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;

  const unit = m[2].toLowerCase();
  switch (unit) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return fallbackMs;
  }
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function getRefreshTokenSecret(): string {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  if (secret && secret.trim().length > 0) return secret;

  // fallback to JWT_SECRET in dev
  return process.env.JWT_SECRET || 'dev_secret_change_me';
}
