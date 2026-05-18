/**
 * Domain Events
 * 
 * PHASE 3: Event-Driven Architecture
 * 
 * WHY EVENTS:
 * - Decouple services (no direct dependencies)
 * - Enable async processing
 * - Support multiple consumers
 * - Audit trail built-in
 * - Easier to scale
 * 
 * DESIGN:
 * - Immutable events
 * - Self-describing (all context included)
 * - Versioned for evolution
 * - Timestamped for ordering
 */

export interface DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: string;
  readonly timestamp: Date;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly payload: Record<string, any>;
  readonly metadata: {
    correlationId?: string;
    causationId?: string;
    userId?: string;
    source: string;
  };
}

/**
 * Reading Ingested Event
 * 
 * Published when: New sensor reading persisted
 * Consumers: ML Service, Analytics, Monitoring
 */
export interface ReadingIngestedEvent extends DomainEvent {
  eventType: 'reading.ingested';
  aggregateType: 'sensor';
  payload: {
    sensorId: string;
    deviceId: string;
    value: number;
    timestamp: string; // ISO 8601
    deviceTimestamp?: string;
    unit: string;
    sensorType: string;
  };
}

/**
 * Threshold Violated Event
 * 
 * Published when: Reading violates threshold
 * Consumers: Alerting, Notifications, Dashboard
 */
export interface ThresholdViolatedEvent extends DomainEvent {
  eventType: 'threshold.violated';
  aggregateType: 'sensor';
  payload: {
    sensorId: string;
    deviceId: string;
    thresholdId: string;
    violationType: 'static' | 'delta';
    severity: 'info' | 'warning' | 'critical';
    value: number;
    thresholdValue?: number;
    message: string;
    metadata: Record<string, any>;
  };
}

/**
 * Alert Created Event
 * 
 * Published when: Alert created from violation
 * Consumers: Notifications, Dashboard, Audit
 */
export interface AlertCreatedEvent extends DomainEvent {
  eventType: 'alert.created';
  aggregateType: 'alert';
  payload: {
    alertId: string;
    sensorId: string;
    deviceId: string;
    severity: 'info' | 'warning' | 'critical';
    status: 'active';
    triggeredValue: number;
    message: string;
  };
}

/**
 * Alert Notification Created Event
 * 
 * Published when: alert_notifications row is created
 * Consumers: WebSocket broadcast for real-time notifications
 */
export interface AlertNotificationCreatedEvent extends DomainEvent {
  eventType: 'alert.notification.created.v1';
  aggregateType: 'alert_notification';
  payload: {
    notificationId: string;
    source: 'alert' | 'ml_event' | 'alert_event';
    sourceEventId: string;
    severity: string;
    title: string;
    message: string | null;
    sensorId?: string | null;
    sensorName?: string | null;
    deviceName?: string | null;
  };
}

/**
 * Sensor Activated Event
 * 
 * Published when: Sensor confirmed and activated
 * Consumers: Monitoring, Analytics, Provisioning
 */
export interface SensorActivatedEvent extends DomainEvent {
  eventType: 'sensor.activated';
  aggregateType: 'sensor';
  payload: {
    sensorId: string;
    sensorUuid: string;
    deviceId: string;
    deviceUuid: string;
    sensorType: string;
    unit: string;
    activatedAt: string;
    activatedBy?: string;
  };
}

/**
 * Device Connected Event
 * 
 * Published when: Device comes online
 * Consumers: Monitoring, Dashboard, Analytics
 */
export interface DeviceConnectedEvent extends DomainEvent {
  eventType: 'device.connected';
  aggregateType: 'device';
  payload: {
    deviceId: string;
    deviceUuid: string;
    deviceType: string;
    lastConnection: string;
    sensorCount: number;
  };
}

/**
 * Prediction Completed Event
 * 
 * Published when: ML prediction completed
 * Consumers: Dashboard, Alerting, Analytics
 */
export interface PredictionCompletedEvent extends DomainEvent {
  eventType: 'prediction.completed';
  aggregateType: 'sensor';
  payload: {
    predictionId: string;
    sensorId: string;
    deviceId: string;
    predictedValue: number;
    confidence: number;
    trend: 'stable' | 'increasing' | 'decreasing';
    engineName: string;
    isAnomaly: boolean;
    anomalyScore?: number;
  };
}

/**
 * Anomaly Detected Event
 * 
 * Published when: Anomaly detected by any source (SP, Classifier, ML)
 * Consumers: Dashboard, Alerting, Notifications
 * 
 * CRITICAL: Replaces polling of dbo.ml_events
 */
export interface AnomalyDetectedEvent extends DomainEvent {
  eventType: 'anomaly.detected.v1';
  aggregateType: 'sensor';
  payload: {
    // IDEMPOTENCY
    idempotencyKey: string; // SHA256 - Deterministic deduplication
    
    // IDENTITY
    sensorId: string;
    deviceId: string;
    
    // CLASSIFICATION
    eventCode: string; // DELTA_SPIKE | ML_ANOMALY | THRESHOLD_VIOLATION
    eventType: 'critical' | 'warning' | 'notice';
    
    // TEMPORAL
    detectedAt: string; // ISO8601 UTC - When anomaly was detected
    readingTimestamp: string; // ISO8601 UTC - Original reading time
    
    // MEASUREMENT
    value: number;
    previousValue?: number;
    
    // CONFIDENCE & SCORING
    anomalyScore: number; // 0.0-1.0
    anomalyConfidence?: number; // 0.0-1.0 (ML only)
    
    // CONTEXT
    source: 'sp' | 'classifier' | 'ml_service' | 'cdc';
    reason: string;
    metadata?: {
      deltaAbs?: number;
      deltaRel?: number;
      thresholdViolated?: string;
      mlMethod?: string;
    };
    
    // AUDIT
    version: string; // "1.0"
  };
}

/**
 * Event Type Registry
 * 
 * Central registry of all event types
 */
export const EventTypes = {
  READING_INGESTED: 'reading.ingested',
  THRESHOLD_VIOLATED: 'threshold.violated',
  ALERT_CREATED: 'alert.created',
  SENSOR_ACTIVATED: 'sensor.activated',
  DEVICE_CONNECTED: 'device.connected',
  PREDICTION_COMPLETED: 'prediction.completed',
  ANOMALY_DETECTED: 'anomaly.detected.v1',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];
