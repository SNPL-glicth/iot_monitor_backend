/**
 * Utilidad de reintento automático para deadlocks de SQL Server.
 *
 * Unificación de las implementaciones previas en:
 * - src/monitoring/monitoring.service.ts
 * - src/realtime/realtime.poller.ts
 *
 * DIFERENCIAS RESUELTAS:
 * - realtime.poller.ts verificaba `e.errno` además de `e.number` y `e.code`.
 *   Se adoptó esa versión más robusta.
 * - Ambas usaban el mismo backoff exponencial + jitter.
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Detecta si un error es un deadlock de SQL Server (error 1205).
 *
 * Revisa propiedades conocidas: `number`, `errno`, `code`, y el mensaje.
 */
export function isDeadlockError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  const code = e.number ?? e.errno ?? e.code ?? '';
  const message = String(e.message ?? '').toLowerCase();
  return code === 1205 || code === '1205' || message.includes('deadlock');
}

/**
 * Ejecuta una operación asíncrona con reintento exponencial cuando
 * se detecta un deadlock de SQL Server.
 *
 * @param operation - Función que retorna una promesa.
 * @param maxRetries - Máximo de reintentos (default: 3).
 * @param baseDelayMs - Delay base en ms (default: 100).
 * @returns El resultado de la operación.
 * @throws El error original si no es deadlock o si se agotan los reintentos.
 *
 * Fórmula de delay: baseDelayMs * 2^attempt + random(0, 50)
 */
export async function withDeadlockRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 100,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isDeadlockError(error) || attempt >= maxRetries) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
      // eslint-disable-next-line no-console
      console.log(
        `[withDeadlockRetry] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
