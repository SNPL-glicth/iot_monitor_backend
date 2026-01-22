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

const MIN_REFRESH_SECRET_LENGTH = 32;

export function getRefreshTokenSecret(): string {
  const secret = process.env.REFRESH_TOKEN_SECRET;
  const jwtSecret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  // SECURITY FIX: In production, require dedicated REFRESH_TOKEN_SECRET
  if (isProduction) {
    if (!secret || secret.trim().length < MIN_REFRESH_SECRET_LENGTH) {
      throw new Error(`REFRESH_TOKEN_SECRET must be set and at least ${MIN_REFRESH_SECRET_LENGTH} characters in production`);
    }
    // Ensure refresh secret is different from JWT secret
    if (secret === jwtSecret) {
      throw new Error('REFRESH_TOKEN_SECRET must be different from JWT_SECRET in production');
    }
    return secret;
  }

  // Dev mode: allow fallbacks with warnings
  if (secret && secret.trim().length >= MIN_REFRESH_SECRET_LENGTH) {
    if (secret === jwtSecret) {
      console.warn('\x1b[33m[SECURITY WARNING] REFRESH_TOKEN_SECRET equals JWT_SECRET - use different secrets in production!\x1b[0m');
    }
    return secret;
  }

  // Fallback chain for dev only
  if (jwtSecret && jwtSecret.trim().length > 0) {
    console.warn('\x1b[33m[SECURITY WARNING] REFRESH_TOKEN_SECRET not set - falling back to JWT_SECRET. DO NOT USE IN PRODUCTION!\x1b[0m');
    return jwtSecret + '_refresh_suffix';
  }

  console.warn('\x1b[33m[SECURITY WARNING] No secrets configured - using insecure dev fallback. DO NOT USE IN PRODUCTION!\x1b[0m');
  return 'dev_refresh_secret_change_me_32chars';
}
