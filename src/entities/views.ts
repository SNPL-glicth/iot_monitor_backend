import { ViewColumn, ViewEntity } from 'typeorm';

@ViewEntity({ name: 'v_devices_with_sensors' })
export class DeviceWithSensorsView {
  @ViewColumn({ name: 'device_id' })
  deviceId!: string;

  @ViewColumn({ name: 'device_uuid' })
  deviceUuid!: string;

  @ViewColumn({ name: 'device_name' })
  deviceName!: string;

  @ViewColumn({ name: 'device_type' })
  deviceType!: string;

  @ViewColumn({ name: 'device_status' })
  deviceStatus!: string;

  @ViewColumn({ name: 'last_connection' })
  lastConnection?: Date | null;

  @ViewColumn({ name: 'sensor_id' })
  sensorId!: string | null;

  @ViewColumn({ name: 'sensor_uuid' })
  sensorUuid!: string | null;

  @ViewColumn({ name: 'sensor_type' })
  sensorType!: string | null;

  @ViewColumn({ name: 'sensor_name' })
  sensorName!: string | null;

  @ViewColumn({ name: 'unit' })
  unit!: string | null;

  @ViewColumn({ name: 'sensor_active' })
  sensorActive!: boolean | null;

  @ViewColumn({ name: 'sensor_status' })
  sensorStatus!: string | null;
}

@ViewEntity({ name: 'v_active_alerts' })
export class ActiveAlertView {
  @ViewColumn({ name: 'alert_id' })
  alertId!: string;

  @ViewColumn({ name: 'sensor_id' })
  sensorId!: string;

  @ViewColumn({ name: 'device_id' })
  deviceId!: string;

  @ViewColumn()
  severity!: string;

  @ViewColumn()
  status!: string;

  @ViewColumn({ name: 'triggered_value' })
  triggeredValue!: string;

  @ViewColumn({ name: 'triggered_at' })
  triggeredAt!: Date;

  @ViewColumn({ name: 'device_name' })
  deviceName!: string;

  @ViewColumn({ name: 'device_uuid' })
  deviceUuid!: string;

  @ViewColumn({ name: 'sensor_name' })
  sensorName!: string;

  @ViewColumn({ name: 'sensor_type' })
  sensorType!: string;

  @ViewColumn()
  unit!: string;

  @ViewColumn({ name: 'threshold_name' })
  thresholdName!: string | null;

  @ViewColumn({ name: 'condition_type' })
  conditionType!: string | null;

  @ViewColumn({ name: 'threshold_value_min' })
  thresholdValueMin!: string | null;

  @ViewColumn({ name: 'threshold_value_max' })
  thresholdValueMax!: string | null;
}

@ViewEntity({ name: 'v_ml_events_active' })
export class MlEventActiveView {
  @ViewColumn({ name: 'event_id' })
  eventId!: string;

  @ViewColumn({ name: 'event_type' })
  eventType!: string;

  @ViewColumn({ name: 'event_code' })
  eventCode!: string;

  @ViewColumn()
  title!: string;

  @ViewColumn()
  message!: string | null;

  @ViewColumn()
  status!: string;

  @ViewColumn({ name: 'created_at' })
  createdAt!: Date;

  @ViewColumn({ name: 'device_id' })
  deviceId!: string;

  @ViewColumn({ name: 'device_uuid' })
  deviceUuid!: string;

  @ViewColumn({ name: 'device_name' })
  deviceName!: string;

  @ViewColumn({ name: 'sensor_id' })
  sensorId!: string | null;

  @ViewColumn({ name: 'sensor_name' })
  sensorName!: string | null;

  @ViewColumn({ name: 'sensor_type' })
  sensorType!: string | null;

  @ViewColumn()
  unit!: string | null;

  @ViewColumn({ name: 'prediction_id' })
  predictionId!: string | null;

  @ViewColumn({ name: 'predicted_value' })
  predictedValue!: string | null;

  @ViewColumn()
  confidence!: string | null;

  @ViewColumn({ name: 'target_timestamp' })
  targetTimestamp!: Date | null;

  @ViewColumn()
  payload!: string | null;
}

@ViewEntity({ name: 'v_latest_sensor_readings' })
export class LatestSensorReadingView {
  @ViewColumn({ name: 'sensor_id' })
  sensorId!: string;

  @ViewColumn({ name: 'sensor_uuid' })
  sensorUuid!: string;

  @ViewColumn({ name: 'sensor_name' })
  sensorName!: string;

  @ViewColumn({ name: 'sensor_type' })
  sensorType!: string;

  @ViewColumn()
  unit!: string;

  @ViewColumn({ name: 'device_name' })
  deviceName!: string;

  @ViewColumn({ name: 'latest_value' })
  latestValue!: string | null;

  @ViewColumn({ name: 'latest_timestamp' })
  latestTimestamp!: Date | null;
}

@ViewEntity({ name: 'v_alerts_history' })
export class AlertsHistoryView {
  @ViewColumn({ name: 'alert_id' })
  alertId!: string;

  @ViewColumn({ name: 'device_id' })
  deviceId!: string;

  @ViewColumn({ name: 'device_uuid' })
  deviceUuid!: string;

  @ViewColumn({ name: 'device_name' })
  deviceName!: string;

  @ViewColumn({ name: 'sensor_id' })
  sensorId!: string;

  @ViewColumn({ name: 'sensor_name' })
  sensorName!: string;

  @ViewColumn({ name: 'sensor_type' })
  sensorType!: string;

  @ViewColumn()
  unit!: string;

  @ViewColumn({ name: 'threshold_id' })
  thresholdId!: string | null;

  @ViewColumn({ name: 'threshold_name' })
  thresholdName!: string | null;

  @ViewColumn({ name: 'condition_type' })
  conditionType!: string | null;

  @ViewColumn({ name: 'threshold_value_min' })
  thresholdValueMin!: string | null;

  @ViewColumn({ name: 'threshold_value_max' })
  thresholdValueMax!: string | null;

  @ViewColumn()
  severity!: string;

  @ViewColumn()
  status!: string;

  @ViewColumn({ name: 'triggered_value' })
  triggeredValue!: string;

  @ViewColumn({ name: 'triggered_at' })
  triggeredAt!: Date;

  @ViewColumn({ name: 'acknowledged_at' })
  acknowledgedAt!: Date | null;

  @ViewColumn({ name: 'acknowledged_by' })
  acknowledgedBy!: string | null;

  @ViewColumn({ name: 'acknowledged_by_username' })
  acknowledgedByUsername!: string | null;

  @ViewColumn({ name: 'resolved_at' })
  resolvedAt!: Date | null;

  @ViewColumn({ name: 'resolved_by' })
  resolvedBy!: string | null;

  @ViewColumn({ name: 'resolved_by_username' })
  resolvedByUsername!: string | null;
}

@ViewEntity({ name: 'v_device_profile_summary' })
export class DeviceProfileSummaryView {
  @ViewColumn({ name: 'device_id' })
  deviceId!: string;

  @ViewColumn({ name: 'device_uuid' })
  deviceUuid!: string;

  @ViewColumn({ name: 'device_name' })
  deviceName!: string;

  @ViewColumn({ name: 'device_type' })
  deviceType!: string;

  @ViewColumn()
  status!: string;

  @ViewColumn({ name: 'last_connection' })
  lastConnection!: Date | null;

  @ViewColumn({ name: 'sensor_count' })
  sensorCount!: number;

  @ViewColumn({ name: 'active_alerts' })
  activeAlerts!: number;

  @ViewColumn({ name: 'last_alert_at' })
  lastAlertAt!: Date | null;
}

@ViewEntity({ name: 'v_device_timeline' })
export class DeviceTimelineView {
  @ViewColumn({ name: 'event_type' })
  eventType!: string;

  @ViewColumn({ name: 'device_id' })
  deviceId!: string;

  @ViewColumn({ name: 'sensor_id' })
  sensorId!: string | null;

  @ViewColumn({ name: 'occurred_at' })
  occurredAt!: Date;

  @ViewColumn()
  severity!: string;

  @ViewColumn()
  title!: string;

  @ViewColumn()
  payload!: string;
}
