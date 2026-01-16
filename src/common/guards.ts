/**
 * Guard rails para validación de datos en el backend.
 * 
 * ARQUITECTURA DATA-DRIVEN:
 * - El backend es AGNÓSTICO al dominio
 * - NO interpreta qué tipo de sensor es
 * - NO asume rangos físicos por tipo
 * - Solo valida que los valores sean finitos y razonables
 * 
 * Los rangos específicos deben venir de la configuración del sensor en BD.
 */

import { BadRequestException } from '@nestjs/common';

/**
 * DEPRECADO: Los rangos físicos por tipo de sensor violan la arquitectura data-driven.
 * 
 * TODO: Migrar a configuración en BD por sensor (sensor_validation_config).
 * Por ahora, el backend acepta cualquier valor finito y deja que la
 * configuración del sensor defina los límites válidos.
 * 
 * Este objeto se mantiene vacío para compatibilidad, pero NO se usa.
 */
const PHYSICAL_LIMITS: Record<string, { min: number; max: number; unit: string }> = {
  // ARQUITECTURA: No hardcodear límites por tipo de sensor
  // Los límites vienen de la configuración del sensor en BD
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
