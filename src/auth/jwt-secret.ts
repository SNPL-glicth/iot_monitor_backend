import { Logger } from '@nestjs/common';
import {
  assertJwtSecretMeetsMinimumSecurityRequirements,
  isRunningInTestEnvironment,
} from '../config/security-config.validator';

const logger = new Logger('JwtSecret');

export function getJwtSecret(): string {
  if (!isRunningInTestEnvironment()) {
    assertJwtSecretMeetsMinimumSecurityRequirements();
  }

  const secret = process.env.JWT_SECRET;

  if (secret && secret.trim().length > 0) {
    return secret;
  }

  logger.warn(
    'JWT_SECRET not set — using insecure dev fallback. DO NOT USE IN PRODUCTION!',
  );
  return 'dev_secret_change_me_at_least_32_chars';
}
