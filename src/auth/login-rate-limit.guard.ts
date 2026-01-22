import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Rate Limiter para Login - Protección contra brute force.
 * 
 * Implementación in-memory simple (sin Redis) para MVP.
 * 
 * Reglas:
 * - Máximo 5 intentos por IP en 15 minutos
 * - Máximo 10 intentos por username en 1 hora
 * - Después de exceder: HTTP 429 con Retry-After header
 * 
 * NOTA: En producción con múltiples instancias, usar Redis.
 */

interface RateLimitEntry {
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}

// Almacenamiento in-memory (por proceso)
const ipAttempts = new Map<string, RateLimitEntry>();
const userAttempts = new Map<string, RateLimitEntry>();

// Configuración
const IP_MAX_ATTEMPTS = 5;
const IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const IP_BLOCK_MS = 15 * 60 * 1000; // 15 minutos de bloqueo

const USER_MAX_ATTEMPTS = 10;
const USER_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const USER_BLOCK_MS = 30 * 60 * 1000; // 30 minutos de bloqueo

// Limpieza periódica de entradas antiguas (cada 5 minutos)
setInterval(() => {
  const now = Date.now();
  
  for (const [key, entry] of ipAttempts.entries()) {
    if (now - entry.firstAttempt > IP_WINDOW_MS * 2) {
      ipAttempts.delete(key);
    }
  }
  
  for (const [key, entry] of userAttempts.entries()) {
    if (now - entry.firstAttempt > USER_WINDOW_MS * 2) {
      userAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(LoginRateLimitGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const ip = this.getClientIp(request);
    const username = request.body?.username?.toLowerCase?.() || 'unknown';
    const now = Date.now();

    // 1. Verificar límite por IP
    const ipResult = this.checkLimit(
      ipAttempts,
      ip,
      IP_MAX_ATTEMPTS,
      IP_WINDOW_MS,
      IP_BLOCK_MS,
      now,
    );

    if (!ipResult.allowed) {
      this.logger.warn(`[RATE_LIMIT] IP blocked: ${ip} (${ipResult.remaining}s remaining)`);
      response.setHeader('Retry-After', String(ipResult.remaining));
      response.setHeader('X-RateLimit-Limit', String(IP_MAX_ATTEMPTS));
      response.setHeader('X-RateLimit-Remaining', '0');
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many login attempts from this IP. Please try again later.',
          retryAfter: ipResult.remaining,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Verificar límite por username
    const userResult = this.checkLimit(
      userAttempts,
      `user:${username}`,
      USER_MAX_ATTEMPTS,
      USER_WINDOW_MS,
      USER_BLOCK_MS,
      now,
    );

    if (!userResult.allowed) {
      this.logger.warn(`[RATE_LIMIT] User blocked: ${username} (${userResult.remaining}s remaining)`);
      response.setHeader('Retry-After', String(userResult.remaining));
      response.setHeader('X-RateLimit-Limit', String(USER_MAX_ATTEMPTS));
      response.setHeader('X-RateLimit-Remaining', '0');
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many login attempts for this account. Please try again later.',
          retryAfter: userResult.remaining,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Registrar intento
    this.recordAttempt(ipAttempts, ip, IP_WINDOW_MS, now);
    this.recordAttempt(userAttempts, `user:${username}`, USER_WINDOW_MS, now);

    // Headers informativos
    response.setHeader('X-RateLimit-Limit', String(IP_MAX_ATTEMPTS));
    response.setHeader('X-RateLimit-Remaining', String(IP_MAX_ATTEMPTS - ipResult.count - 1));

    return true;
  }

  private checkLimit(
    store: Map<string, RateLimitEntry>,
    key: string,
    maxAttempts: number,
    windowMs: number,
    blockMs: number,
    now: number,
  ): { allowed: boolean; count: number; remaining: number } {
    const entry = store.get(key);

    if (!entry) {
      return { allowed: true, count: 0, remaining: 0 };
    }

    // Si está bloqueado, verificar si el bloqueo expiró
    if (entry.blockedUntil) {
      if (now < entry.blockedUntil) {
        const remainingSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
        return { allowed: false, count: entry.count, remaining: remainingSeconds };
      }
      // Bloqueo expiró, resetear
      store.delete(key);
      return { allowed: true, count: 0, remaining: 0 };
    }

    // Verificar si la ventana de tiempo expiró
    if (now - entry.firstAttempt > windowMs) {
      store.delete(key);
      return { allowed: true, count: 0, remaining: 0 };
    }

    // Verificar si excedió el límite
    if (entry.count >= maxAttempts) {
      // Bloquear
      entry.blockedUntil = now + blockMs;
      const remainingSeconds = Math.ceil(blockMs / 1000);
      return { allowed: false, count: entry.count, remaining: remainingSeconds };
    }

    return { allowed: true, count: entry.count, remaining: 0 };
  }

  private recordAttempt(
    store: Map<string, RateLimitEntry>,
    key: string,
    windowMs: number,
    now: number,
  ): void {
    const entry = store.get(key);

    if (!entry || now - entry.firstAttempt > windowMs) {
      store.set(key, { count: 1, firstAttempt: now });
    } else {
      entry.count++;
    }
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}

/**
 * Función para limpiar intentos después de login exitoso.
 * Llamar desde AuthService después de validar credenciales.
 */
export function clearLoginAttempts(ip: string, username: string): void {
  ipAttempts.delete(ip);
  userAttempts.delete(`user:${username.toLowerCase()}`);
}

/**
 * Obtener estadísticas de rate limiting (para debugging).
 */
export function getRateLimitStats(): { ipEntries: number; userEntries: number } {
  return {
    ipEntries: ipAttempts.size,
    userEntries: userAttempts.size,
  };
}
