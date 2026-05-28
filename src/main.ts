import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe, INestApplication } from '@nestjs/common';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import cookieParser from 'cookie-parser';

import { csrfMiddleware } from './common/middleware/csrf.middleware';
import { assertJwtSecretMeetsMinimumSecurityRequirements } from './config/security-config.validator';

function assertSecurityConfigurationIsValidBeforeServerStarts(): void {
  assertJwtSecretMeetsMinimumSecurityRequirements();
}

function extractClientIpFromRequest(request: any): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }

  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return request.ip || 'unknown';
}

function buildDebugEndpointRateLimiterTo10RequestsPerMinute(): any {
  const store = new Map<string, number[]>();
  const maxRequests = 10;
  const windowMs = 60 * 1000;

  return (req: any, res: any, next: any) => {
    const path = req.path || '';
    if (!path.includes('/debug')) {
      return next();
    }

    const ip = extractClientIpFromRequest(req);
    const now = Date.now();
    const timestamps = store.get(ip) || [];
    const validTimestamps = timestamps.filter((t) => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      return res.status(429).json({
        statusCode: 429,
        message: `Debug rate limit exceeded: max ${maxRequests} requests per ${windowMs / 1000}s`,
      });
    }

    validTimestamps.push(now);
    store.set(ip, validTimestamps);
    next();
  };
}

async function shutdownNestApplicationGracefully(
  app: INestApplication,
  signal: string,
): Promise<void> {
  Logger.log(`${signal} recibido — cerrando servidor...`);
  await app.close();
  Logger.log('Servidor cerrado. Saliendo.');
  process.exit(0);
}

function registerShutdownHandlersForNestApplication(
  app: INestApplication,
): void {
  process.on('SIGTERM', () =>
    shutdownNestApplicationGracefully(app, 'SIGTERM'),
  );
  process.on('SIGINT', () =>
    shutdownNestApplicationGracefully(app, 'SIGINT'),
  );
}

async function bootstrap() {
  assertSecurityConfigurationIsValidBeforeServerStarts();

  const app = await NestFactory.create(AppModule);

  registerShutdownHandlersForNestApplication(app);

  app.use(buildDebugEndpointRateLimiterTo10RequestsPerMinute());

  app.use(cookieParser());

  app.use(csrfMiddleware);

  app.useGlobalInterceptors(new HttpLoggingInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS
  //
  // - En dev, el frontend React (Vite) suele correr en http://localhost:5173
  // - En prod, puedes setear CORS_ORIGINS con una lista separada por comas.
  //
  // Importante: permitimos requests sin `Origin` (curl/Postman) para no romper debugging.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const defaultDevOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:64899',
    'http://127.0.0.1:56854',
    // Android emulator accede al host via 10.0.2.2
    'http://10.0.2.2:3000',
    'http://10.0.2.2',
  ];

  const allowedOrigins = corsOrigins.length > 0 ? corsOrigins : defaultDevOrigins;

  const isProduction = process.env.NODE_ENV === 'production';

  app.enableCors({
    origin: (origin, callback) => {
      // In production, require Origin header (blocks curl/postman without explicit origin)
      if (!origin) {
        if (isProduction) {
          return callback(new Error('Origin header required in production'), false);
        }
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-XSRF-TOKEN'],
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  Logger.log(` 😎 Backend en http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
