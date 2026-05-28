import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { extractClientIp } from '../common/rate-limiting/client-ip-extractor';
import { RateLimitStore } from '../common/rate-limiting/rate-limit-store';

const LOGIN_CONFIG = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
};

@Injectable()
export class LoginRateLimitGuard extends RateLimitGuard implements CanActivate {
  private readonly userStore: RateLimitStore;

  constructor() {
    super(LOGIN_CONFIG);
    this.userStore = new RateLimitStore({
      windowMs: 60 * 60 * 1000,
      maxRequests: 10,
    });
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = extractClientIp(request);
    const username = (request.body?.username as string)?.toLowerCase() ?? 'unknown';

    const ipAllowed = this.checkIp(ip);
    if (!ipAllowed) {
      this.emitSecurityAudit(ip, username);
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const userAllowed = this.checkUser(username);
    if (!userAllowed) {
      this.emitSecurityAudit(ip, username);
      throw new HttpException(
        { statusCode: HttpStatus.TOO_MANY_REQUESTS },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private checkIp(ip: string): boolean {
    const decision = this.store.isAllowed(ip);
    if (!decision.allowed) return false;
    this.store.record(ip);
    return true;
  }

  private checkUser(username: string): boolean {
    const key = `user:${username}`;
    const decision = this.userStore.isAllowed(key);
    if (!decision.allowed) return false;
    this.userStore.record(key);
    return true;
  }

  private emitSecurityAudit(ip: string, username: string): void {
    this.logger.warn('security_audit_login_rate_limited', { ip, username });
  }
}
