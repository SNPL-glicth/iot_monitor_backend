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
  /** Sensor en warm-up, acumulando lecturas base - NO genera eventos */
  INITIALIZING: 'initializing',
  /** Sin alertas ni warnings activos */
  NORMAL: 'normal',
  /** Warning activo (delta spike, predicción de riesgo menor) */
  WARNING: 'warning',
  /** Alerta activa (violación de umbral crítico) */
  ALERT: 'alert',
  /** Predicción de posible breach futuro */
  PREDICTION: 'prediction',
  /** Sensor sin datos recientes (> STALE_THRESHOLD_MS) */
  STALE: 'stale',
  /** Estado no determinable */
  UNKNOWN: 'unknown',
} as const;

/**
 * @deprecated ARQUITECTURA DATA-DRIVEN: Este valor ya no se usa.
 * 
 * El umbral de STALE ahora viene de la configuración del sensor:
 * - Tabla: sensor_threshold_profiles
 * - Columna: stale_threshold_ms
 * - Default: 86400000 (24 horas)
 * 
 * Cada sensor puede definir su propio umbral según su naturaleza:
 * - Sensores críticos: 5 minutos (300000 ms)
 * - Sensores estándar: 1 hora (3600000 ms)
 * - Sensores de baja frecuencia: 24 horas (86400000 ms)
 * 
 * Esta constante se mantiene solo para referencia y compatibilidad.
 * NO debe usarse en código nuevo.
 */
export const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 horas - DEPRECADO

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
 * IMPORTANTE: Esta función evalúa si el valor VIOLA los umbrales.
 * - out_of_range: valor < min O valor > max → VIOLA
 * - greater_than: valor > min → VIOLA (min y max definen rango normal)
 * - less_than: valor < min → VIOLA
 * 
 * Si el valor está DENTRO del rango definido por el usuario, es NORMAL.
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
    warningConditionType?: string | null;
    alertConditionType?: string | null;
  },
): SensorTelemetryStateType {
  if (value === null) {
    return SensorTelemetryState.NORMAL;
  }

  const { warningMin, warningMax, alertMin, alertMax, warningConditionType, alertConditionType } = thresholds;

  // =========================================================================
  // Primero verificar ALERT (más crítico)
  // =========================================================================
  const alertViolated = evaluateThresholdViolation(
    value,
    alertMin,
    alertMax,
    alertConditionType ?? 'out_of_range',
  );
  if (alertViolated) {
    return SensorTelemetryState.ALERT;
  }

  // =========================================================================
  // Luego WARNING
  // =========================================================================
  const warningViolated = evaluateThresholdViolation(
    value,
    warningMin,
    warningMax,
    warningConditionType ?? 'out_of_range',
  );
  if (warningViolated) {
    return SensorTelemetryState.WARNING;
  }

  return SensorTelemetryState.NORMAL;
}

/**
 * Evalúa si un valor VIOLA un umbral según el tipo de condición.
 * 
 * @param value - Valor a evaluar
 * @param min - Umbral mínimo
 * @param max - Umbral máximo
 * @param conditionType - Tipo de condición
 * @returns true si el valor VIOLA el umbral (está fuera del rango normal)
 */
function evaluateThresholdViolation(
  value: number,
  min: number | null | undefined,
  max: number | null | undefined,
  conditionType: string,
): boolean {
  // FIX CRÍTICO: Forzar conversión a número para evitar comparación string vs number
  const numMin = (min !== null && min !== undefined) ? Number(min) : null;
  const numMax = (max !== null && max !== undefined) ? Number(max) : null;
  
  // Sin umbrales → no hay violación
  if (numMin === null && numMax === null) {
    return false;
  }

  // =========================================================================
  // FIX ARQUITECTÓNICO: Si hay AMBOS min Y max definidos, SIEMPRE usar out_of_range
  // 
  // RAZÓN: Si el usuario configura min=6 y max=13, espera que el valor esté
  // DENTRO de ese rango para ser NORMAL. El conditionType puede estar mal
  // configurado en la BD, pero la intención del usuario es clara.
  // 
  // REGLA: 
  // - Si hay min Y max → out_of_range (valor debe estar DENTRO del rango)
  // - Si solo hay min → greater_than o less_than según conditionType
  // - Si solo hay max → greater_than o less_than según conditionType
  // =========================================================================
  
  // Si hay AMBOS min y max, forzar lógica out_of_range
  if (numMin !== null && numMax !== null) {
    // Viola si está FUERA del rango [min, max]
    return value < numMin || value > numMax;
  }
  
  // Solo hay uno de los dos umbrales, usar conditionType
  switch (conditionType) {
    case 'greater_than':
      // Viola si value > umbral
      const gtThreshold = numMin ?? numMax;
      return gtThreshold !== null && value > gtThreshold;
      
    case 'less_than':
      // Viola si value < umbral
      const ltThreshold = numMin ?? numMax;
      return ltThreshold !== null && value < ltThreshold;
      
    case 'out_of_range':
    default:
      // Solo un umbral definido, evaluar ese
      if (numMin !== null && value < numMin) return true;
      if (numMax !== null && value > numMax) return true;
      return false;
  }
}
