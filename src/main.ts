import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import cookieParser from 'cookie-parser';

import { csrfMiddleware } from './common/middleware/csrf.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse cookies early (needed for JWT cookie auth + CSRF)
  app.use(cookieParser());

  // CSRF protection for cookie-based sessions
  app.use(csrfMiddleware);

  // Logs dinámicos de requests/responses (útil para ver acciones en tiempo real)
  app.useGlobalInterceptors(new HttpLoggingInterceptor());

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

  app.enableCors({
    origin: (origin, callback) => {
      // requests sin Origin (curl/postman)
      if (!origin) return callback(null, true);

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
