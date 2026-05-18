/**
 * Event Validator
 * 
 * PHASE 4: Schema validation for domain events
 * 
 * Features:
 * - Version-aware validation
 * - Strict schema enforcement
 * - Reject invalid events to DLQ
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('EventValidator');

/**
 * Event schema definitions
 */
const EVENT_SCHEMAS = {
  'anomaly.detected.v1': {
    required: [
      'eventId',
      'eventType',
      'eventVersion',
      'timestamp',
      'aggregateId',
      'aggregateType',
      'payload',
    ],
    payload: {
      required: [
        'sensorId',
        'deviceId',
        'eventCode',
        'eventType',
        'detectedAt',
        'value',
        'anomalyScore',
        'source',
        'reason',
      ],
      optional: [
        'idempotencyKey',
        'readingTimestamp',
        'previousValue',
        'anomalyConfidence',
        'metadata',
      ],
    },
  },
  'anomaly.detected.v2': {
    // Future version with additional fields
    required: [
      'eventId',
      'eventType',
      'eventVersion',
      'timestamp',
      'aggregateId',
      'aggregateType',
      'tenantId', // Required in v2
      'payload',
    ],
    payload: {
      required: [
        'sensorId',
        'deviceId',
        'eventCode',
        'eventType',
        'detectedAt',
        'value',
        'anomalyScore',
        'source',
        'reason',
        'confidence', // Required in v2
      ],
      optional: [
        'idempotencyKey',
        'readingTimestamp',
        'previousValue',
        'anomalyConfidence',
        'metadata',
      ],
    },
  },
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  eventType?: string;
  eventVersion?: string;
}

/**
 * Validate event against schema
 */
export function validateEvent(event: any): ValidationResult {
  const errors: string[] = [];

  // 1. Check if event is an object
  if (!event || typeof event !== 'object') {
    return {
      valid: false,
      errors: ['Event must be an object'],
    };
  }

  // 2. Extract event type and version
  const eventType = event.eventType;
  const eventVersion = event.eventVersion;

  if (!eventType) {
    errors.push('Missing eventType');
  }

  if (!eventVersion) {
    errors.push('Missing eventVersion');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // 3. Get schema for this event type
  const schema = EVENT_SCHEMAS[eventType as keyof typeof EVENT_SCHEMAS];

  if (!schema) {
    return {
      valid: false,
      errors: [`Unknown event type: ${eventType}`],
      eventType,
      eventVersion,
    };
  }

  // 4. Validate top-level required fields
  for (const field of schema.required) {
    if (!(field in event)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // 5. Validate payload if present
  if (event.payload && typeof event.payload === 'object') {
    const payload = event.payload;

    // Check required payload fields
    for (const field of schema.payload.required) {
      if (!(field in payload)) {
        errors.push(`Missing required payload field: ${field}`);
      }
    }

    // Validate field types (basic type checking)
    if (payload.sensorId && typeof payload.sensorId !== 'string') {
      errors.push('payload.sensorId must be a string');
    }

    if (payload.value !== undefined && typeof payload.value !== 'number') {
      errors.push('payload.value must be a number');
    }

    if (
      payload.anomalyScore !== undefined &&
      (typeof payload.anomalyScore !== 'number' ||
        payload.anomalyScore < 0 ||
        payload.anomalyScore > 1)
    ) {
      errors.push('payload.anomalyScore must be a number between 0 and 1');
    }

    if (payload.detectedAt && !isValidISO8601(payload.detectedAt)) {
      errors.push('payload.detectedAt must be a valid ISO 8601 timestamp');
    }
  } else if ('payload' in event) {
    errors.push('payload must be an object');
  }

  // 6. Validate timestamp format
  if (event.timestamp && !isValidISO8601(event.timestamp)) {
    errors.push('timestamp must be a valid ISO 8601 timestamp');
  }

  // 7. Validate eventId format (should be non-empty string)
  if (event.eventId && typeof event.eventId !== 'string') {
    errors.push('eventId must be a string');
  }

  if (event.eventId && event.eventId.length === 0) {
    errors.push('eventId cannot be empty');
  }

  return {
    valid: errors.length === 0,
    errors,
    eventType,
    eventVersion,
  };
}

/**
 * Validate ISO 8601 timestamp
 */
function isValidISO8601(timestamp: string): boolean {
  if (typeof timestamp !== 'string') {
    return false;
  }

  const date = new Date(timestamp);
  return !isNaN(date.getTime()) && date.toISOString() === timestamp;
}

/**
 * Get supported event types
 */
export function getSupportedEventTypes(): string[] {
  return Object.keys(EVENT_SCHEMAS);
}

/**
 * Check if event type is supported
 */
export function isEventTypeSupported(eventType: string): boolean {
  return eventType in EVENT_SCHEMAS;
}

/**
 * Log validation error
 */
export function logValidationError(
  result: ValidationResult,
  eventData: any,
): void {
  logger.error(
    `Event validation failed: ${result.eventType || 'unknown'} v${result.eventVersion || 'unknown'}`,
  );
  logger.error(`Errors: ${result.errors.join(', ')}`);
  logger.debug(`Event data: ${JSON.stringify(eventData).substring(0, 200)}...`);
}
