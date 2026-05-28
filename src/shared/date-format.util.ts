/**
 * Utilidades de formateo de fechas y parseo de rangos temporales.
 *
 * Extraídas de:
 * - src/monitoring/monitoring.service.ts
 * - src/monitoring/sensor-metrics.service.ts
 */

/**
 * Formatea una fecha a ISO-8601 estándar.
 *
 * @param date - Fecha como Date, string ISO, null o undefined.
 * @returns String ISO-8601 (ej: "2026-03-12T02:27:30.000Z") o null.
 *
 * @example
 * formatDateTime(new Date('2026-03-12')) // "2026-03-12T00:00:00.000Z"
 * formatDateTime(null)                   // null
 * formatDateTime(undefined)              // null
 * formatDateTime('2026-03-12T02:27:30Z') // "2026-03-12T02:27:30.000Z"
 */
export function formatDateTime(
  date: Date | string | null | undefined,
): string | null {
  if (!date) {
    return null;
  }

  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Formatea una fecha al formato legacy DD/MM/YYYY HH:MM.
 *
 * @deprecated Usar {@link formatDateTime} que retorna ISO-8601.
 * Mantiene formato legacy para clientes antiguos si es necesario.
 *
 * @param date - Fecha como Date, string ISO, null o undefined.
 * @returns String en formato "12/03/2026 02:27" o null.
 *
 * @example
 * formatDateTimeLegacy(new Date('2026-03-12T02:27:00Z')) // "12/03/2026 02:27"
 * formatDateTimeLegacy(null)                              // null
 */
export function formatDateTimeLegacy(
  date: Date | string | null | undefined,
): string | null {
  if (!date) {
    return null;
  }

  const d = typeof date === 'string' ? new Date(date) : date;

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Convierte un string de rango temporal a milisegundos.
 *
 * Soporta: `1m`, `5m`, `15m`, `30m`, `1h`, `6h`, `12h`, `24h`, `7d`, `30d`, etc.
 *
 * @param range - String en formato `<número><unidad>`.
 * @returns Milisegundos correspondientes. Default 1h si el formato es inválido.
 *
 * @example
 * parseRangeToMs('1h')   // 3600000
 * parseRangeToMs('6h')   // 21600000
 * parseRangeToMs('24h')  // 86400000
 * parseRangeToMs('7d')   // 604800000
 * parseRangeToMs('30d')  // 2592000000
 * parseRangeToMs('5m')   // 300000
 * parseRangeToMs('bad')  // 3600000 (default)
 */
export function parseRangeToMs(range: string): number {
  const match = range.match(/^(\d+)(m|h|d)$/);
  if (!match) return 60 * 60 * 1000; // default 1h

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
}
