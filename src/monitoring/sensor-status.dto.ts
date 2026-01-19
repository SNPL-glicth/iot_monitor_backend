import { SensorFinalState as CanonicalSensorFinalState } from '../common/sensor-states';

/**
 * Estados finales del sensor.
 * Re-exportamos desde las constantes canónicas para mantener compatibilidad.
 */
export const SensorFinalState = {
  ALERT: CanonicalSensorFinalState.ALERT,
  WARNING: CanonicalSensorFinalState.WARNING,
  PREDICTION: CanonicalSensorFinalState.PREDICTION,
  NORMAL: CanonicalSensorFinalState.NORMAL,
  UNKNOWN: CanonicalSensorFinalState.UNKNOWN,
} as const;

export type SensorFinalStateType = typeof SensorFinalState[keyof typeof SensorFinalState];

export type ActiveAlert = {
  id: number;
  sensor_id: number;
  device_id: number;
  threshold_id: number;
  severity: string;
  status: string;
  triggered_value: number;
  triggered_at: Date;
};

export type ActiveWarning = {
  id: number;
  sensor_id: number;
  device_id: number;
  event_type: string;
  event_code: string;
  status: string;
  created_at: Date;
  title: string | null;
  message: string | null;
  payload: Record<string, any> | null;
};

export type CurrentPrediction = {
  id: number;
  sensor_id: number;
  model_id: number;
  predicted_value: number;
  confidence: number;
  predicted_at: Date;
  target_timestamp: Date;
};

/**
 * Estado operacional autoritativo del sensor (SSOT).
 * Fuente única de verdad - NO inferir desde alertas/warnings.
 */
export type OperationalState = {
  /** Estado actual: INITIALIZING, NORMAL, WARNING, ALERT, STALE */
  state: 'INITIALIZING' | 'NORMAL' | 'WARNING' | 'ALERT' | 'STALE' | 'UNKNOWN';
  /** Timestamp de la última transición de estado */
  state_since: string | null;
  /** Lecturas válidas consecutivas (para warm-up) */
  valid_readings_count: number;
  /** Mínimo de lecturas para transicionar a NORMAL */
  min_readings_for_normal: number;
  /** True si el sensor puede generar WARNING/ALERT */
  can_generate_events: boolean;
};

export type SensorConsolidatedStatus = {
  sensor_id: number;
  final_state: SensorFinalStateType;
  alert_active: ActiveAlert | null;
  warning_active: ActiveWarning[];
  prediction_current: CurrentPrediction | null;
  /** Estado operacional autoritativo (SSOT) */
  operational_state: OperationalState;
};
