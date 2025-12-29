import type { Response } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const CSRF_COOKIE = 'XSRF-TOKEN';

function cookieOptions() {
  const secure = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production';

  const sameSiteRaw = (process.env.COOKIE_SAMESITE ?? 'lax').toLowerCase();
  const sameSite =
    sameSiteRaw === 'none'
      ? ('none' as const)
      : sameSiteRaw === 'strict'
        ? ('strict' as const)
        : ('lax' as const);

  const domain = process.env.COOKIE_DOMAIN?.trim() || undefined;

  return { secure, sameSite, domain };
}

export function setAccessTokenCookie(res: Response, token: string, maxAgeMs: number) {
  const { secure, sameSite, domain } = cookieOptions();

  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function clearAccessTokenCookie(res: Response) {
  const { secure, sameSite, domain } = cookieOptions();

  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path: '/',
  });
}

export function setRefreshTokenCookie(res: Response, token: string, maxAgeMs: number) {
  const { secure, sameSite, domain } = cookieOptions();

  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path: '/auth',
    maxAge: maxAgeMs,
  });
}

export function clearRefreshTokenCookie(res: Response) {
  const { secure, sameSite, domain } = cookieOptions();

  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure,
    sameSite,
    domain,
    path: '/auth',
  });
}

export function setCsrfCookie(res: Response, token: string) {
  const { secure, sameSite, domain } = cookieOptions();

  // CSRF token must be readable by the browser so axios can send it back as a header.
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure,
    sameSite,
    domain,
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
}

export function clearCsrfCookie(res: Response) {
  const { secure, sameSite, domain } = cookieOptions();

  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure,
    sameSite,
    domain,
    path: '/',
  });
}
