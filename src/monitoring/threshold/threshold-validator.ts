/**
 * ThresholdValidator — Lógica pura de validación de umbrales.
 *
 * Sin dependencias de TypeORM, NestJS ni HTTP.
 * Ideal para tests unitarios sin levantar base de datos.
 */

export type ThresholdConditionType =
  | 'greater_than'
  | 'less_than'
  | 'equal_to'
  | 'out_of_range';

export interface ThresholdValidationResult {
  min: number | null;
  max: number | null;
  conditionType: ThresholdConditionType;
}

export class ThresholdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThresholdValidationError';
  }
}

export class ThresholdValidator {
  private static readonly ALLOWED_CONDITIONS = new Set([
    'greater_than',
    'less_than',
    'equal_to',
    'out_of_range',
  ]);

  private static readonly DEFAULT_BOUNDS = { min: -1e12, max: 1e12 };

  validate(args: {
    conditionType: string;
    thresholdValueMin: unknown;
    thresholdValueMax: unknown;
    sensorType?: string;
    unit?: string;
  }): ThresholdValidationResult {
    const condition = (args.conditionType || '').toLowerCase().trim();

    if (!ThresholdValidator.ALLOWED_CONDITIONS.has(condition)) {
      throw new ThresholdValidationError('Condición inválida para el límite.');
    }

    const min = this.parseOptionalNumber(args.thresholdValueMin);
    const max = this.parseOptionalNumber(args.thresholdValueMax);

    if (condition === 'out_of_range') {
      if (min === null || max === null) {
        throw new ThresholdValidationError(
          'Para "fuera de rango" debes indicar mínimo y máximo.',
        );
      }
      if (min > max) {
        throw new ThresholdValidationError(
          'El mínimo no puede ser mayor al máximo.',
        );
      }
    } else {
      if (min === null) {
        throw new ThresholdValidationError(
          'Debes indicar el valor del límite.',
        );
      }
    }

    const effectiveMax = condition === 'out_of_range' ? max : null;
    const bounds = this.getLimitBounds(args.sensorType, args.unit);

    const checkOne = (label: string, v: number) => {
      if (v < bounds.min || v > bounds.max) {
        const unitSuffix = args.unit?.trim() ? ` ${args.unit}` : '';
        throw new ThresholdValidationError(
          `${label} fuera de rango realista para este sensor (permitido: ${bounds.min} a ${bounds.max}${unitSuffix}).`,
        );
      }
    };

    if (min !== null) checkOne('Valor', min);
    if (effectiveMax !== null) checkOne('Valor', effectiveMax);

    return {
      min,
      max: effectiveMax,
      conditionType: condition as ThresholdConditionType,
    };
  }

  private parseOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  private getLimitBounds(
    _sensorType?: string,
    _unit?: string,
  ): { min: number; max: number } {
    // ARQUITECTURA: No hardcodear por tipo de sensor.
    // Usar rango amplio que permita cualquier tipo de métrica.
    return { ...ThresholdValidator.DEFAULT_BOUNDS };
  }
}
