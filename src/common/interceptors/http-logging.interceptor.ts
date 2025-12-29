import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    const method = req?.method;
    const url = req?.originalUrl ?? req?.url;
    const start = Date.now();

    // passport-jwt suele adjuntar el payload en req.user
    const user = req?.user;
    const userLabel = user
      ? `user=${user.username ?? user.sub ?? user.id ?? 'unknown'} role=${user.role ?? 'unknown'}`
      : 'user=anonymous';

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          const status = res?.statusCode;
          this.logger.log(`${method} ${url} ${status} ${ms}ms ${userLabel}`);
        },
        error: (err) => {
          const ms = Date.now() - start;
          const status = err?.status ?? err?.statusCode ?? res?.statusCode ?? 500;
          // No logueamos body sensible; solo mensaje y status.
          this.logger.warn(`${method} ${url} ${status} ${ms}ms ${userLabel} error=${err?.message ?? err}`);
        },
      }),
    );
  }
}
