/**
 * FASE 4: Rate Limiting Guard para NestJS
 * 
 * Implementación ligera sin dependencias externas.
 * Usa ventana deslizante en memoria (sliding window).
 * 
 * Configuración via env vars:
 * - RATE_LIMIT_WINDOW_MS (default: 60000 = 1 min)
 * - RATE_LIMIT_MAX_REQUESTS (default: 100)
 * - RATE_LIMIT_ENABLED (default: true)
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

// Metadata key for custom rate limits
export const RATE_LIMIT_KEY = 'rateLimit';

// Decorator para configurar rate limit por endpoint
export const RateLimit = (limit: number, windowMs?: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs });

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly defaultWindowMs: number;
  private readonly defaultMaxRequests: number;
  private readonly enabled: boolean;
  private lastCleanup = Date.now();
  private readonly cleanupInterval = 60000; // 1 min

  constructor(private readonly reflector: Reflector) {
    this.defaultWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
    this.defaultMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
    this.enabled = process.env.RATE_LIMIT_ENABLED !== 'false';
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = this.getKey(request);

    // Obtener límites personalizados del decorator o usar defaults
    const customLimit = this.reflector.get<{ limit: number; windowMs?: number }>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    const maxRequests = customLimit?.limit ?? this.defaultMaxRequests;
    const windowMs = customLimit?.windowMs ?? this.defaultWindowMs;

    // Limpiar entradas antiguas periódicamente
    this.maybeCleanup();

    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      // Nueva ventana
      this.store.set(key, { count: 1, windowStart: now });
      return true;
    }

    // Incrementar contador
    entry.count++;

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000}s.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getKey(request: Request): string {
    // Usar IP + path para rate limiting granular
    const ip = this.getClientIp(request);
    const path = request.path;
    return `${ip}:${path}`;
  }

  private getClientIp(request: Request): string {
    // Considerar proxies
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

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) {
      return;
    }

    this.lastCleanup = now;
    const cutoff = now - this.defaultWindowMs * 2;

    for (const [key, entry] of this.store.entries()) {
      if (entry.windowStart < cutoff) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Rate limit específico para endpoints batch.
 * Más restrictivo: 30 requests/min por IP.
 */
export const BatchRateLimit = () => RateLimit(30, 60000);

/**
 * Rate limit para endpoints de lectura frecuente.
 * Más permisivo: 200 requests/min por IP.
 */
export const ReadRateLimit = () => RateLimit(200, 60000);

/**
 * Rate limit para endpoints de escritura.
 * Restrictivo: 60 requests/min por IP.
 */
export const WriteRateLimit = () => RateLimit(60, 60000);
