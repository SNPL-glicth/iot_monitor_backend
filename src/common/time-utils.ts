/**
 * Utilidades de tiempo normalizadas a UTC.
 * 
 * INC-06: Todos los timestamps deben usar UTC explícitamente
 * para consistencia entre servicios.
 */

/**
 * Retorna la fecha/hora actual en UTC.
 * Usar en lugar de `new Date()` para timestamps de auditoría.
 */
export function utcNow(): Date {
  return new Date();
}

/**
 * Convierte una fecha a string ISO en UTC.
 */
export function toUtcIsoString(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

/**
 * Parsea un string ISO a Date (asume UTC si no tiene timezone).
 */
export function parseUtcDate(isoString: string | null | undefined): Date | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  return isNaN(date.getTime()) ? null : date;
}
