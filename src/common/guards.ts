/**
 * Guard rails para validación de datos en el backend.
 * 
 * FASE 3: Validaciones explícitas para rechazo temprano de datos inválidos.
 */

import { BadRequestException } from '@nestjs/common';

/**
 * Rangos físicos absolutos por tipo de sensor.
 * Valores fuera de estos rangos son físicamente imposibles.
 */
const PHYSICAL_LIMITS: Record<string, { min: number; max: number; unit: string }> = {
  temperature: { min: -100, max: 500, unit: '°C' },
  humidity: { min: 0, max: 100, unit: '%' },
  pressure: { min: 0, max: 2000, unit: 'hPa' },
  air_quality: { min: 0, max: 10000, unit: 'ppm' },
  voltage: { min: 0, max: 1000, unit: 'V' },
  power: { min: 0, max: 1000000, unit: 'W' },
  ph: { min: 0, max: 14, unit: 'pH' },
};

/**
 * Valida que un valor sea un número finito válido.
 */
export function validateFiniteNumber(value: unknown, fieldName = 'value'): number {
  if (value === null || value === undefined) {
    throw new BadRequestException(`${fieldName} es requerido`);
  }

  const num = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(num)) {
    throw new BadRequestException(`${fieldName} debe ser un número válido`);
  }

  return num;
}

/**
 * Valida que un valor esté dentro de rangos físicos para un tipo de sensor.
 */
export function validatePhysicalRange(
  value: number,
  sensorType: string,
  options: { throwOnInvalid?: boolean } = {},
): { isValid: boolean; reason?: string } {
  const { throwOnInvalid = false } = options;
  const normalizedType = (sensorType || '').toLowerCase().trim();
  const limits = PHYSICAL_LIMITS[normalizedType];

  if (!limits) {
    // Tipo de sensor desconocido, aceptar cualquier valor finito
    return { isValid: true };
  }

  if (value < limits.min || value > limits.max) {
    const reason = `Valor ${value} fuera de rango físico para ${normalizedType} (${limits.min} - ${limits.max} ${limits.unit})`;
    
    if (throwOnInvalid) {
      throw new BadRequestException(reason);
    }
    
    return { isValid: false, reason };
  }

  return { isValid: true };
}

/**
 * Valida que un sensor ID sea válido.
 */
export function validateSensorId(sensorId: unknown): number {
  if (sensorId === null || sensorId === undefined) {
    throw new BadRequestException('sensor_id es requerido');
  }

  const id = typeof sensorId === 'number' ? sensorId : Number(sensorId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException('sensor_id debe ser un entero positivo');
  }

  return id;
}

/**
 * Valida que un array de IDs sea válido.
 */
export function validateSensorIds(idsRaw: string): number[] {
  if (!idsRaw || typeof idsRaw !== 'string') {
    throw new BadRequestException('Se requiere al menos un sensor_id');
  }

  const ids = idsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !isNaN(Number(s)))
    .map(Number);

  if (ids.length === 0) {
    throw new BadRequestException('No se proporcionaron sensor_ids válidos');
  }

  // Límite razonable para evitar DoS
  if (ids.length > 100) {
    throw new BadRequestException('Máximo 100 sensor_ids por consulta');
  }

  return ids;
}

/**
 * Valida que un rango de tiempo sea válido.
 */
export function validateTimeRange(range: string): string {
  const validRanges = ['1h', '6h', '12h', '24h', '7d'];
  
  if (!validRanges.includes(range)) {
    throw new BadRequestException(
      `Rango inválido. Valores permitidos: ${validRanges.join(', ')}`,
    );
  }

  return range;
}
