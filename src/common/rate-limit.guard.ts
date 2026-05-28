import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitStore } from './rate-limiting/rate-limit-store';
import { extractClientIp } from './rate-limiting/client-ip-extractor';
import type { RateLimitConfig } from './rate-limiting/interfaces/rate-limit.interfaces';

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  protected readonly logger = new Logger(RateLimitGuard.name);
  protected readonly store: RateLimitStore;

  constructor(config: RateLimitConfig = DEFAULT_CONFIG) {
    this.store = new RateLimitStore(config);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientKey = `${extractClientIp(request)}:${request.path}`;

    const decision = this.store.isAllowed(clientKey);

    if (!decision.allowed) {
      this.logger.warn('rate_limit_exceeded', { clientKey });
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          retryAfter: Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.store.record(clientKey);
    return true;
  }
}
