/**
 * Constantes canónicas para estados de sensor.
 * 
 * FUENTE ÚNICA DE VERDAD para estados de telemetría.
 * Todos los servicios deben usar estas constantes.
 * 
 * Convención: MAYÚSCULAS para consistencia con telemetría existente.
 */

/**
 * Estados de telemetría del sensor (valor de lectura vs umbrales)
 */
export const SensorTelemetryState = {
  /** Valor dentro de rangos normales */
  NORMAL: 'NORMAL',
  /** Valor en zona de advertencia (warning thresholds) */
  WARNING: 'WARNING',
  /** Valor en zona crítica (alert thresholds) */
  ALERT: 'ALERT',
} as const;

export type SensorTelemetryStateType = typeof SensorTelemetryState[keyof typeof SensorTelemetryState];

/**
 * Estado consolidado final del sensor (considerando alertas, warnings, predicciones)
 */
export const SensorFinalState = {
  /** Sin alertas ni warnings activos */
  NORMAL: 'normal',
  /** Warning activo (delta spike, predicción de riesgo menor) */
  WARNING: 'warning',
  /** Alerta activa (violación de umbral crítico) */
  ALERT: 'alert',
  /** Predicción de posible breach futuro */
  PREDICTION: 'prediction',
  /** Estado no determinable */
  UNKNOWN: 'unknown',
} as const;

export type SensorFinalStateType = typeof SensorFinalState[keyof typeof SensorFinalState];

/**
 * Severidades de alertas/eventos
 */
export const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const;

export type AlertSeverityType = typeof AlertSeverity[keyof typeof AlertSeverity];

/**
 * Evalúa el estado de telemetría de un valor contra umbrales.
 * 
 * @param value - Valor actual del sensor
 * @param thresholds - Umbrales configurados
 * @returns Estado de telemetría (NORMAL, WARNING, ALERT)
 */
export function evaluateTelemetryState(
  value: number | null,
  thresholds: {
    warningMin?: number | null;
    warningMax?: number | null;
    alertMin?: number | null;
    alertMax?: number | null;
  },
): SensorTelemetryStateType {
  if (value === null) {
    return SensorTelemetryState.NORMAL;
  }

  const { warningMin, warningMax, alertMin, alertMax } = thresholds;

  // Primero verificar ALERT (más crítico)
  if (alertMin !== null && alertMin !== undefined && value < alertMin) {
    return SensorTelemetryState.ALERT;
  }
  if (alertMax !== null && alertMax !== undefined && value > alertMax) {
    return SensorTelemetryState.ALERT;
  }

  // Luego WARNING
  if (warningMin !== null && warningMin !== undefined && value < warningMin) {
    return SensorTelemetryState.WARNING;
  }
  if (warningMax !== null && warningMax !== undefined && value > warningMax) {
    return SensorTelemetryState.WARNING;
  }

  return SensorTelemetryState.NORMAL;
}
