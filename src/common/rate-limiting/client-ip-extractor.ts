import type { Request } from 'express';

const UNKNOWN_IP = 'unknown';

export function extractClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string') {
    return realIp;
  }

  return request.socket?.remoteAddress ?? UNKNOWN_IP;
}
