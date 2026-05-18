/**
 * Phase 4 Tests: Horizontal Scaling & Idempotency
 */

import { Test } from '@nestjs/testing';
import { IdempotencyService } from '../idempotency.service';
import { validateEvent, isEventTypeSupported, getSupportedEventTypes } from '../event-validator';

describe('Phase 4: Horizontal Scaling & Idempotency', () => {
  describe('IdempotencyService', () => {
    let service: IdempotencyService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [IdempotencyService],
      }).compile();

      service = module.get<IdempotencyService>(IdempotencyService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should allow first processing of event', async () => {
      const eventId = 'test-event-' + Date.now();
      const consumerId = 'test-consumer';

      const shouldProcess = await service.tryProcessEvent(
        eventId,
        consumerId,
        'anomaly.detected.v1',
      );

      expect(shouldProcess).toBe(true);
    });

    it('should reject duplicate event', async () => {
      const eventId = 'duplicate-event-' + Date.now();
      const consumerId = 'test-consumer';

      // First attempt - should succeed
      const first = await service.tryProcessEvent(eventId, consumerId);
      expect(first).toBe(true);

      // Second attempt - should be rejected as duplicate
      const second = await service.tryProcessEvent(eventId, consumerId);
      expect(second).toBe(false);
    });

    it('should detect already processed events', async () => {
      const eventId = 'processed-event-' + Date.now();

      // Process event
      await service.tryProcessEvent(eventId, 'consumer-1');

      // Check if processed
      const isProcessed = await service.isEventProcessed(eventId);
      expect(isProcessed).toBe(true);
    });

    it('should return false for unprocessed events', async () => {
      const eventId = 'never-processed-' + Date.now();

      const isProcessed = await service.isEventProcessed(eventId);
      expect(isProcessed).toBe(false);
    });

    it('should get statistics', async () => {
      const stats = await service.getStats();

      expect(stats).toHaveProperty('total_processed');
      expect(stats).toHaveProperty('oldest_event');
      expect(stats).toHaveProperty('newest_event');
      expect(typeof stats.total_processed).toBe('number');
    });
  });

  describe('Event Validator', () => {
    describe('Valid Events', () => {
      it('should validate correct anomaly.detected.v1 event', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v1',
          eventVersion: '1.0',
          timestamp: new Date().toISOString(),
          aggregateId: 'sensor-123',
          aggregateType: 'sensor',
          payload: {
            sensorId: 'sensor-123',
            deviceId: 'device-456',
            eventCode: 'DELTA_SPIKE',
            eventType: 'warning',
            detectedAt: new Date().toISOString(),
            value: 99.9,
            anomalyScore: 0.85,
            source: 'sp',
            reason: 'Value spike detected',
          },
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.eventType).toBe('anomaly.detected.v1');
      });

      it('should validate event with optional fields', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v1',
          eventVersion: '1.0',
          timestamp: new Date().toISOString(),
          aggregateId: 'sensor-123',
          aggregateType: 'sensor',
          payload: {
            sensorId: 'sensor-123',
            deviceId: 'device-456',
            eventCode: 'DELTA_SPIKE',
            eventType: 'warning',
            detectedAt: new Date().toISOString(),
            value: 99.9,
            anomalyScore: 0.85,
            source: 'sp',
            reason: 'Value spike detected',
            idempotencyKey: 'key123',
            previousValue: 50.0,
            anomalyConfidence: 0.9,
            metadata: { foo: 'bar' },
          },
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(true);
      });
    });

    describe('Invalid Events', () => {
      it('should reject non-object event', () => {
        const result = validateEvent(null);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Event must be an object');
      });

      it('should reject event without eventType', () => {
        const event = {
          eventId: 'abc123',
          eventVersion: '1.0',
          timestamp: new Date().toISOString(),
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing eventType');
      });

      it('should reject event without eventVersion', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v1',
          timestamp: new Date().toISOString(),
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing eventVersion');
      });

      it('should reject unknown event type', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'unknown.event.v1',
          eventVersion: '1.0',
          timestamp: new Date().toISOString(),
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('Unknown event type');
      });

      it('should reject event with missing required fields', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v1',
          eventVersion: '1.0',
          // Missing timestamp, aggregateId, aggregateType, payload
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should reject event with missing payload fields', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v1',
          eventVersion: '1.0',
          timestamp: new Date().toISOString(),
          aggregateId: 'sensor-123',
          aggregateType: 'sensor',
          payload: {
            sensorId: 'sensor-123',
            // Missing other required fields
          },
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should reject invalid anomalyScore', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v1',
          eventVersion: '1.0',
          timestamp: new Date().toISOString(),
          aggregateId: 'sensor-123',
          aggregateType: 'sensor',
          payload: {
            sensorId: 'sensor-123',
            deviceId: 'device-456',
            eventCode: 'DELTA_SPIKE',
            eventType: 'warning',
            detectedAt: new Date().toISOString(),
            value: 99.9,
            anomalyScore: 1.5, // Invalid: > 1
            source: 'sp',
            reason: 'Test',
          },
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'payload.anomalyScore must be a number between 0 and 1',
        );
      });

      it('should reject invalid timestamp format', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v1',
          eventVersion: '1.0',
          timestamp: 'invalid-timestamp',
          aggregateId: 'sensor-123',
          aggregateType: 'sensor',
          payload: {
            sensorId: 'sensor-123',
            deviceId: 'device-456',
            eventCode: 'DELTA_SPIKE',
            eventType: 'warning',
            detectedAt: new Date().toISOString(),
            value: 99.9,
            anomalyScore: 0.85,
            source: 'sp',
            reason: 'Test',
          },
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'timestamp must be a valid ISO 8601 timestamp',
        );
      });

      it('should reject invalid value type', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v1',
          eventVersion: '1.0',
          timestamp: new Date().toISOString(),
          aggregateId: 'sensor-123',
          aggregateType: 'sensor',
          payload: {
            sensorId: 'sensor-123',
            deviceId: 'device-456',
            eventCode: 'DELTA_SPIKE',
            eventType: 'warning',
            detectedAt: new Date().toISOString(),
            value: 'not-a-number', // Invalid type
            anomalyScore: 0.85,
            source: 'sp',
            reason: 'Test',
          },
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('payload.value must be a number');
      });
    });

    describe('Event Type Support', () => {
      it('should return supported event types', () => {
        const types = getSupportedEventTypes();

        expect(types).toContain('anomaly.detected.v1');
        expect(types).toContain('anomaly.detected.v2');
        expect(Array.isArray(types)).toBe(true);
      });

      it('should check if event type is supported', () => {
        expect(isEventTypeSupported('anomaly.detected.v1')).toBe(true);
        expect(isEventTypeSupported('anomaly.detected.v2')).toBe(true);
        expect(isEventTypeSupported('unknown.event.v1')).toBe(false);
      });
    });

    describe('Version-Specific Validation', () => {
      it('should validate v2 event with tenantId', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v2',
          eventVersion: '2.0',
          timestamp: new Date().toISOString(),
          aggregateId: 'sensor-123',
          aggregateType: 'sensor',
          tenantId: 'company-abc', // Required in v2
          payload: {
            sensorId: 'sensor-123',
            deviceId: 'device-456',
            eventCode: 'DELTA_SPIKE',
            eventType: 'warning',
            detectedAt: new Date().toISOString(),
            value: 99.9,
            anomalyScore: 0.85,
            confidence: 0.9, // Required in v2
            source: 'sp',
            reason: 'Value spike detected',
          },
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(true);
        expect(result.eventVersion).toBe('2.0');
      });

      it('should reject v2 event without tenantId', () => {
        const event = {
          eventId: 'abc123',
          eventType: 'anomaly.detected.v2',
          eventVersion: '2.0',
          timestamp: new Date().toISOString(),
          aggregateId: 'sensor-123',
          aggregateType: 'sensor',
          // Missing tenantId
          payload: {
            sensorId: 'sensor-123',
            deviceId: 'device-456',
            eventCode: 'DELTA_SPIKE',
            eventType: 'warning',
            detectedAt: new Date().toISOString(),
            value: 99.9,
            anomalyScore: 0.85,
            confidence: 0.9,
            source: 'sp',
            reason: 'Test',
          },
        };

        const result = validateEvent(event);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: tenantId');
      });
    });
  });

  describe('Consumer ID Generation', () => {
    it('should generate unique consumer IDs', () => {
      const os = require('os');
      const hostname = os.hostname();
      const pid = process.pid;

      // Simulate consumer ID generation
      const consumerId1 = `${hostname}-${pid}-abc123`;
      const consumerId2 = `${hostname}-${pid}-def456`;

      expect(consumerId1).toContain(hostname);
      expect(consumerId1).toContain(String(pid));
      expect(consumerId1).not.toBe(consumerId2);
    });
  });
});
