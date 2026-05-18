import { Injectable, Logger } from '@nestjs/common';
import {
  SensorTelemetryState,
  SensorTelemetryStateType,
  evaluateTelemetryState,
} from '../common/sensor-states';

/**
 * StateComputationService - Única fuente de verdad para state computation.
 *
 * Responsabilidades:
 * - Centralizar lógica de state computation (NORMAL/WARNING/ALERT)
 * - Evaluar thresholds contra valores actuales
 * - Interpretar severidad de ML events
 * - Proporcionar estado operacional autoritativo
 *
 * NO hace:
 * - Persistencia (eso es responsabilidad de otros servicios)
 * - Agregación (eso es responsabilidad de Telemetry)
 * - Inferencia ML (eso es responsabilidad de ML Service)
 */
@Injectable()
export class StateComputationService {
  private readonly logger = new Logger(StateComputationService.name);

  /**
   * Evalúa el estado de un valor contra umbrales.
   *
   * Esta es la única fuente de verdad para state computation en el sistema.
   * Telemetry, Flutter y otros servicios deben consumir este resultado
   * en lugar de computar estado localmente.
   *
   * @param value Valor a evaluar
   * @param thresholds Umbrales configurados
   * @returns Estado del sensor (NORMAL, WARNING, ALERT)
   */
  evaluateValueState(
    value: number | null,
    thresholds: {
      warningMin?: number | null;
      warningMax?: number | null;
      alertMin?: number | null;
      alertMax?: number | null;
      warningConditionType?: 'greater_than' | 'less_than' | 'equal_to' | 'out_of_range';
      alertConditionType?: 'greater_than' | 'less_than' | 'equal_to' | 'out_of_range';
    },
  ): SensorTelemetryStateType {
    return evaluateTelemetryState(value, thresholds);
  }

  /**
   * Evalúa el estado operativo de un sensor considerando múltiples factores.
   *
   * Considera:
   * - Estado actual del valor contra umbrales
   * - Alertas activas
   * - Warnings activos (ML events)
   * - Predicciones de breach
   * - Estado operacional persistido en BD (INITIALIZING, STALE, etc.)
   *
   * @param params Parámetros de evaluación
   * @returns Estado final del sensor
   */
  evaluateSensorOperationalState(params: {
    currentValue: number | null;
    thresholds: {
      warningMin?: number | null;
      warningMax?: number | null;
      alertMin?: number | null;
      alertMax?: number | null;
      warningConditionType?: 'greater_than' | 'less_than' | 'equal_to' | 'out_of_range';
      alertConditionType?: 'greater_than' | 'less_than' | 'equal_to' | 'out_of_range';
    };
    hasActiveAlerts: boolean;
    hasActiveWarnings: boolean;
    predictionWouldBreach: boolean;
    operationalStateFromDb?: string; // Estado persistido por ingest
    isStale: boolean;
  }): string {
    // Si hay estado operacional persistido en BD, usarlo como SSOT
    // (INITIALIZING, STALE, etc. son estados operacionales, no de threshold)
    if (params.operationalStateFromDb) {
      const validStates = ['INITIALIZING', 'NORMAL', 'WARNING', 'ALERT', 'STALE'];
      if (validStates.includes(params.operationalStateFromDb)) {
        // Si está en INITIALIZING o STALE, mantener ese estado
        if (params.operationalStateFromDb === 'INITIALIZING' || 
            params.operationalStateFromDb === 'STALE') {
          return params.operationalStateFromDb;
        }
        // Si es NORMAL/WARNING/ALERT, verificar si sigue válido
        // (puede haber cambiado desde que se persistió)
      }
    }

    // Si es STALE (sin datos recientes), retornar STALE
    if (params.isStale) {
      return 'STALE';
    }

    // Evaluar estado del valor actual contra umbrales
    const telemetryState = this.evaluateValueState(
      params.currentValue,
      params.thresholds,
    );

    // Si hay alertas activas, estado es ALERT
    if (params.hasActiveAlerts) {
      return 'ALERT';
    }

    // Si hay warnings activos, estado es WARNING
    if (params.hasActiveWarnings) {
      return 'WARNING';
    }

    // Si la predicción cruzaría umbrales, estado es PREDICTION
    if (params.predictionWouldBreach) {
      return 'PREDICTION';
    }

    // Sino, usar estado de telemetry
    const stateMap: Record<SensorTelemetryStateType, string> = {
      [SensorTelemetryState.NORMAL]: 'NORMAL',
      [SensorTelemetryState.WARNING]: 'WARNING',
      [SensorTelemetryState.ALERT]: 'ALERT',
    };

    return stateMap[telemetryState] || 'NORMAL';
  }

  /**
   * Interpreta la severidad de un ML event.
   *
   * Convierte códigos de evento ML a severidades operacionales.
   *
   * @param eventCode Código de evento ML
   * @returns Severidad (critical, warning, info, unknown)
   */
  interpretMLEventSeverity(eventCode: string): 'critical' | 'warning' | 'info' | 'unknown' {
    const code = String(eventCode).toUpperCase();

    // Eventos críticos
    if (code.includes('DELTA_SPIKE') || code.includes('ANOMALY')) {
      return 'critical';
    }

    // Eventos de warning
    if (code.includes('TREND') || code.includes('REGIME')) {
      return 'warning';
    }

    // Eventos informativos
    if (code.includes('NORMAL') || code.includes('STABLE')) {
      return 'info';
    }

    return 'unknown';
  }

  /**
   * Determina si se requiere acción basado en estado y severidad.
   *
   * @param state Estado del sensor
   * @param severity Severidad
   * @returns Si se requiere acción
   */
  isActionRequired(
    state: string,
    severity: 'critical' | 'warning' | 'info' | 'unknown',
  ): boolean {
    // Acción requerida si es CRITICAL o ALERT
    if (severity === 'critical' || state === 'ALERT') {
      return true;
    }

    // Acción opcional si es WARNING
    if (severity === 'warning' || state === 'WARNING') {
      return false; // Warning es informativo, no requiere acción inmediata
    }

    return false;
  }

  /**
   * Genera acción recomendada basado en estado.
   *
   * @param state Estado del sensor
   * @param value Valor actual
   * @param thresholds Umbrales
   * @returns Acción recomendada o null si no aplica
   */
  recommendAction(
    state: string,
    value: number | null,
    thresholds: {
      warningMin?: number | null;
      warningMax?: number | null;
      alertMin?: number | null;
      alertMax?: number | null;
    },
  ): string | null {
    if (state === 'ALERT') {
      if (value !== null) {
        if (thresholds.alertMin !== null && thresholds.alertMin !== undefined && value < thresholds.alertMin) {
          return 'Investigar valor por debajo del umbral crítico';
        }
        if (thresholds.alertMax !== null && thresholds.alertMax !== undefined && value > thresholds.alertMax) {
          return 'Investigar valor por encima del umbral crítico';
        }
      }
      return 'Investigar alerta activa';
    }

    if (state === 'WARNING') {
      if (value !== null) {
        if (thresholds.warningMin !== null && thresholds.warningMin !== undefined && value < thresholds.warningMin) {
          return 'Monitorear valor por debajo del umbral de advertencia';
        }
        if (thresholds.warningMax !== null && thresholds.warningMax !== undefined && value > thresholds.warningMax) {
          return 'Monitorear valor por encima del umbral de advertencia';
        }
      }
      return 'Monitorear warning activo';
    }

    if (state === 'PREDICTION') {
      return 'Prepararse para posible breach de umbral según predicción';
    }

    if (state === 'STALE') {
      return 'Verificar conectividad del sensor';
    }

    return null;
  }
}
