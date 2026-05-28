import { formatDateTime } from '../../shared/date-format.util';
import { Sensor } from '../../entities/sensor.entity';
import { SensorReading } from '../../entities/sensor-reading.entity';
import { Alert } from '../../entities/alert.entity';
import { MlEventActiveView } from '../../entities/views';
import { Prediction } from '../../entities/prediction.entity';
export function buildConsolidatedStatusResponse(
  sensor: Sensor,
  latestReading: SensorReading | null,
  activeAlerts: Alert[],
  activeWarnings: MlEventActiveView[],
  latestPrediction: Prediction | null,
  thresholds: any[],
  finalState: string,
) {
  const warningActive = activeWarnings.length > 0 ? {
    id: activeWarnings[0].eventId,
    sensor_id: activeWarnings[0].sensorId,
    device_id: activeWarnings[0].deviceId,
    event_type: activeWarnings[0].eventType,
    event_code: activeWarnings[0].eventCode,
    status: activeWarnings[0].status,
    created_at: formatDateTime(activeWarnings[0].createdAt),
    title: activeWarnings[0].title,
    message: activeWarnings[0].message,
  } : null;

  const predictionCurrent = latestPrediction ? {
    id: latestPrediction.id,
    sensor_id: String(sensor.id),
    model_id: latestPrediction.model?.id ?? null,
    predicted_value: latestPrediction.predictedValue,
    confidence: latestPrediction.confidence,
    predicted_at: formatDateTime(latestPrediction.predictedAt),
    target_timestamp: formatDateTime(latestPrediction.targetTimestamp),
  } : null;

  const alertActive = activeAlerts.length > 0 ? {
    id: activeAlerts[0].id,
    sensor_id: String(sensor.id),
    device_id: sensor.device?.id ?? null,
    threshold_id: activeAlerts[0].threshold?.id ?? null,
    severity: activeAlerts[0].severity,
    status: activeAlerts[0].status,
    triggered_value: activeAlerts[0].triggeredValue,
    triggered_at: formatDateTime(activeAlerts[0].triggeredAt),
  } : null;

  return {
    sensor_id: sensor.id,
    final_state: finalState,
    alert_active: alertActive,
    warning_active: warningActive,
    prediction_current: predictionCurrent,
    operational_state: {
      state: sensor.operationalState ?? 'UNKNOWN',
      state_since: formatDateTime(sensor.stateChangedAt ?? null),
      valid_readings_count: sensor.validReadingsCount ?? 0,
      min_readings_for_normal: sensor.minReadingsForNormal ?? 3,
      can_generate_events: ['NORMAL', 'WARNING', 'ALERT'].includes(sensor.operationalState ?? ''),
    },
    sensorId: sensor.id,
    sensorName: sensor.name,
    sensorType: sensor.sensorType,
    unit: sensor.unit,
    deviceId: sensor.device?.id ?? null,
    deviceName: sensor.device?.name ?? null,
    latestValue: latestReading?.value ?? null,
    latestTimestamp: formatDateTime(latestReading?.timestamp ?? null),
    activeAlertsCount: activeAlerts.length,
    activeAlerts: activeAlerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      triggeredValue: a.triggeredValue,
      triggeredAt: formatDateTime(a.triggeredAt),
    })),
    thresholds,
    status: finalState,
  };
}
