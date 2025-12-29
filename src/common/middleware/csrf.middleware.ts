import type { NextFunction, Request, Response } from 'express';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'x-xsrf-token';

function isMutatingMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

function hasBearerAuth(req: Request): boolean {
  const auth = req.headers.authorization;
  return typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ');
}

function usesCookieSession(req: Request): boolean {
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return !!cookies?.access_token || !!cookies?.refresh_token;
}

function isCsrfExcludedPath(req: Request): boolean {
  // Login happens before we can have a CSRF cookie.
  // Health checks and safe endpoints are excluded by method anyway.
  const path = req.path || '';
  return path === '/auth/login' || path === '/auth/login-token';
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isMutatingMethod(req.method)) {
    return next();
  }

  if (isCsrfExcludedPath(req)) {
    return next();
  }

  // If the client is using Authorization: Bearer, we don't enforce CSRF.
  if (hasBearerAuth(req)) {
    return next();
  }

  // Only enforce CSRF for cookie-based sessions.//para forzar directamente los datos , xdddd
  if (!usesCookieSession(req)) {
    return next();
  }

  const cookies = (req as any).cookies as Record<string, string> | undefined;
  const csrfCookie = cookies?.[CSRF_COOKIE];
  const csrfHeader = req.headers[CSRF_HEADER];

  if (!csrfCookie || !csrfHeader) {
    return res.status(403).json({ message: 'CSRF token missing' });
  }

  if (Array.isArray(csrfHeader)) {
    if (!csrfHeader.includes(csrfCookie)) {
      return res.status(403).json({ message: 'CSRF token invalid' });
    }
    return next();
  }

  if (csrfHeader !== csrfCookie) {
    return res.status(403).json({ message: 'CSRF token invalid' });
  }

  return next();
}
