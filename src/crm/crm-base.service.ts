import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

export type AuthCtx = { userId: string; role?: 'admin' | 'operator' | 'viewer' };

// FIX FASE 3.2: Cache en memoria para reducir queries a BD
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export class InMemoryCache {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttlMs });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// Cache singleton compartido
export const crmCache = new InMemoryCache();

// TTLs configurables
export const CACHE_TTL = {
  DASHBOARD: 30_000,
  BADGE: 30_000,
  DEVICE_LIST: 60_000,
  ML_EVENTS: 20_000,
};

export function isDeadlock1205(err: any): boolean {
  const n =
    err?.number ??
    err?.codeNumber ??
    err?.driverError?.number ??
    err?.originalError?.number ??
    err?.cause?.number;
  return Number(n) === 1205;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withReadUncommitted<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction('READ UNCOMMITTED');
  try {
    const out = await fn(qr.manager);
    await qr.commitTransaction();
    return out;
  } catch (e) {
    try {
      await qr.rollbackTransaction();
    } catch {
      // ignore
    }
    throw e;
  } finally {
    try {
      await qr.release();
    } catch {
      // ignore
    }
  }
}

export async function withReadUncommittedRetry<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<T> {
  const retries = Math.max(0, Math.floor(opts?.retries ?? 2));
  const baseDelayMs = Math.max(0, Math.floor(opts?.baseDelayMs ?? 30));

  let attempt = 0;
  while (true) {
    try {
      return await withReadUncommitted(dataSource, fn);
    } catch (e) {
      if (!isDeadlock1205(e) || attempt >= retries) throw e;
      await sleep(baseDelayMs * Math.pow(2, attempt));
      attempt++;
    }
  }
}

export function clampPageSize(n: number, max = 200): number {
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(Math.floor(n), max);
}

export function isAdmin(ctx: AuthCtx): boolean {
  return ctx.role === 'admin';
}

export function requireUserId(ctx: AuthCtx) {
  if (!ctx.userId) throw new ForbiddenException('Usuario inválido');
}

export async function assertDeviceReadAccess(
  dataSource: DataSource,
  deviceId: number,
  _ctx: AuthCtx,
) {
  const rows: any[] = await withReadUncommittedRetry(dataSource, (manager) =>
    manager.query(
      `SELECT TOP 1 d.id AS id FROM devices d WITH (NOLOCK) WHERE d.id = @0`,
      [deviceId],
    ),
  );
  if (!rows || rows.length === 0) {
    throw new NotFoundException('Dispositivo no encontrado');
  }
}

export async function assertDeviceWriteAccess(
  dataSource: DataSource,
  deviceId: number,
  ctx: AuthCtx,
) {
  if (ctx.role !== 'admin' && ctx.role !== 'operator') {
    throw new ForbiddenException('Sin permisos de escritura');
  }
  await assertDeviceReadAccess(dataSource, deviceId, ctx);
}

export function parseDateOrThrow(label: string, value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${label} inválido (usa ISO 8601)`);
  }
  return d;
}

export function chooseBucket(from: Date, to: Date, maxPoints: number): '1m' | '5m' | '1h' {
  const rangeMs = to.getTime() - from.getTime();
  if (rangeMs <= 0) return '1m';

  let bucket: '1m' | '5m' | '1h' =
    rangeMs <= 24 * 60 * 60 * 1000
      ? '1m'
      : rangeMs <= 30 * 24 * 60 * 60 * 1000
        ? '5m'
        : '1h';

  const stepMs = (b: typeof bucket) =>
    b === '1m' ? 60_000 : b === '5m' ? 300_000 : 3_600_000;
  const next = (b: typeof bucket) => (b === '1m' ? '5m' : b === '5m' ? '1h' : '1h');

  while (
    Math.ceil(rangeMs / stepMs(bucket)) > Math.max(50, maxPoints) &&
    bucket !== '1h'
  ) {
    bucket = next(bucket);
  }

  return bucket;
}

export function parseSensorIds(sensorIds?: string): string[] {
  if (!sensorIds) return [];
  return sensorIds
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => String(Number(s)))
    .filter((s) => s !== 'NaN');
}
