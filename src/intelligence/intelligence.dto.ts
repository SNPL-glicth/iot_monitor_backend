export type IntelligenceSeverity = 'info' | 'warning' | 'critical';

export class IntelligencePredictionDto {
  sensorId!: string;
  sensorName!: string;
  deviceId!: string;
  deviceName!: string;

  predictedValue!: number;
  unit!: string | null;
  horizonMinutes!: number;
  trend!: string; // up | down | stable

  // Severidad combinada (ML core): info | warning | critical
  severity!: IntelligenceSeverity;
  // Nivel de riesgo físico (umbral) independiente de la anomalía: NONE | LOW | MEDIUM | HIGH
  riskLevel!: string;
  // Anomalía estadística y score normalizado 0-1
  isAnomaly!: boolean;
  anomalyScore!: number | null;
  // Estado lógico de la predicción (active / resolved / ...)
  status!: string;

  explanation!: string;
  recommendedAction!: string;

  targetTimestamp!: string; // ISO
}

export class IntelligenceWarningDto {
  eventId!: string;
  sensorId!: string | null;
  sensorName!: string | null;
  deviceId!: string;
  deviceName!: string;

  severity!: IntelligenceSeverity;
  status!: 'active' | 'acknowledged' | 'resolved';

  title!: string;
  description!: string;
  recommendedAction!: string;

  occurredAt!: string; // ISO
}

export type IntelligenceHealthStatus = 'ok' | 'degraded' | 'down';

export class IntelligenceHealthSummaryDto {
  status!: IntelligenceHealthStatus;
  title!: string;
  description!: string;
  suggestion!: string;

  lastBatchRunAt!: string | null;
  maxIngestionLagMinutes!: number;
  activeModels!: number;
  staleModels!: number;
  monitoredSensors!: number;
}

export class IntelligenceSensorHealthDto {
  sensorId!: string;
  sensorName!: string;
  deviceName!: string;

  status!: IntelligenceHealthStatus;
  lastPredictionAt!: string | null;
  lastMlEventAt!: string | null;

  description!: string;
  suggestion!: string;
}

export class IntelligenceHealthDto {
  summary!: IntelligenceHealthSummaryDto;
  sensors!: IntelligenceSensorHealthDto[];
}
