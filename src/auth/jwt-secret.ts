import { Logger } from '@nestjs/common';

const MIN_SECRET_LENGTH = 32;
const logger = new Logger('JwtSecret');

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.trim().length >= MIN_SECRET_LENGTH) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set and at least 32 characters in production');
  }

  if (!secret || secret.trim().length === 0) {
    logger.warn('JWT_SECRET not set - using insecure dev fallback. DO NOT USE IN PRODUCTION!');
    return 'dev_secret_change_me_at_least_32_chars';
  }

  logger.warn('JWT_SECRET is below recommended length. Using anyway in dev mode.');
  return secret;
}
