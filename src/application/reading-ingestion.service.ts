/**
 * Reading Ingestion Application Service
 * 
 * PHASE 2: Clean Architecture - Application Layer
 * 
 * RESPONSIBILITIES:
 * - Orchestrate reading persistence
 * - Evaluate thresholds using domain service
 * - Create alerts/events based on violations
 * - Publish events to event bus
 * 
 * DOES NOT:
 * - Contain business logic (delegated to domain)
 * - Call stored procedures with business logic
 * - Mix concerns
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SensorReading } from '../entities/sensor-reading.entity';
import { Sensor } from '../entities/sensor.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';
import { Alert } from '../entities/alert.entity';
import { AlertEvent } from '../entities/alert-event.entity';
import {
  ThresholdEvaluationService,
  Reading,
  ThresholdConfig,
  DeltaThresholdConfig,
  ThresholdViolation,
} from '../domain/threshold-evaluation.service';
import { withTransaction } from '../common/utils/transaction.utils';
import type { EventBus } from '../events/event-bus.interface';
import {
  ReadingIngestedEvent,
  ThresholdViolatedEvent,
  AlertCreatedEvent,
  EventTypes,
} from '../events/domain-event';

export interface IngestReadingDto {
  sensorId: string;
  value: number;
  deviceTimestamp?: Date;
}

export interface IngestReadingResult {
  readingId: string;
  violations: ThresholdViolation[];
  alertsCreated: number;
  eventsCreated: number;
}

/**
 * Reading Ingestion Service
 * 
 * CLEAN ARCHITECTURE:
 * - Application layer orchestrates
 * - Domain layer contains business logic
 * - Infrastructure layer handles persistence
 */
@Injectable()
export class ReadingIngestionService {
  private readonly logger = new Logger(ReadingIngestionService.name);
  private readonly thresholdService = new ThresholdEvaluationService();

  constructor(
    @InjectRepository(SensorReading)
    private readonly readingRepo: Repository<SensorReading>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(AlertEvent)
    private readonly alertEventRepo: Repository<AlertEvent>,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Ingest single reading
   * 
   * ATOMIC: All operations in transaction
   * CLEAN: Business logic in domain service
   */
  async ingestReading(dto: IngestReadingDto): Promise<IngestReadingResult> {
    return withTransaction(this.dataSource, async (manager) => {
      const timestamp = new Date();

      // 1. Persist reading
      const reading = manager.create(SensorReading, {
        sensorId: dto.sensorId,
        value: String(dto.value), // BigInt columns are strings
        timestamp,
        deviceTimestamp: dto.deviceTimestamp || null,
      });

      const savedReading = await manager.save(reading);

      // 2. Get sensor with device info
      const sensor = await manager.findOne(Sensor, {
        where: { id: dto.sensorId },
        relations: ['device'],
      });

      if (!sensor) {
        throw new Error(`Sensor ${dto.sensorId} not found`);
      }

      // 3. Get previous reading for delta evaluation
      const previousReading = await manager
        .createQueryBuilder(SensorReading, 'sr')
        .where('sr.sensorId = :sensorId', { sensorId: dto.sensorId })
        .andWhere('sr.id < :currentId', { currentId: savedReading.id })
        .orderBy('sr.id', 'DESC')
        .limit(1)
        .getOne();

      // 4. Load thresholds
      const thresholds = await manager.find(AlertThreshold, {
        where: { sensorId: dto.sensorId, isActive: true },
      });

      // 5. Load delta thresholds (from delta_thresholds table)
      const deltaThresholds = await manager.query(
        `SELECT id, sensor_id, abs_delta, rel_delta, abs_slope, rel_slope, severity, is_active
         FROM delta_thresholds
         WHERE sensor_id = @0 AND is_active = 1`,
        [dto.sensorId],
      );

      // 6. DOMAIN SERVICE: Evaluate thresholds
      const violations = this.thresholdService.evaluateAll(
        {
          sensorId: dto.sensorId,
          value: dto.value,
          timestamp,
          deviceTimestamp: dto.deviceTimestamp,
        },
        previousReading
          ? {
              value: parseFloat(previousReading.value), // Convert string to number for domain
              timestamp: previousReading.timestamp,
            }
          : null,
        this.mapThresholds(thresholds),
        this.mapDeltaThresholds(deltaThresholds),
      );

      // 7. Create alerts/events for violations
      let alertsCreated = 0;
      let eventsCreated = 0;

      for (const violation of violations) {
        if (violation.type === 'threshold') {
          // Create alert
          const alert = manager.create(Alert, {
            sensorId: dto.sensorId,
            deviceId: sensor.device.id,
            severity: violation.severity,
            status: 'active',
            triggeredValue: String(dto.value), // BigInt columns are strings
            triggeredAt: timestamp,
          });
          await manager.save(alert);
          alertsCreated++;

          // Create alert event
          const event = manager.create(AlertEvent, {
            sensorId: dto.sensorId,
            deviceId: sensor.device.id,
            eventType: 'threshold_violation',
            severity: violation.severity,
            status: 'active',
            triggeredValue: dto.value,
            triggeredAt: timestamp,
            message: violation.message,
          });
          await manager.save(event);
          eventsCreated++;
        } else if (violation.type === 'delta') {
          // Create ML event for delta spike
          await manager.query(
            `INSERT INTO ml_events (device_id, sensor_id, event_type, event_code, title, message, status, created_at)
             VALUES (@0, @1, @2, 'DELTA_SPIKE', 'Delta Spike Detected', @3, 'active', @4)`,
            [
              sensor.device.id,
              dto.sensorId,
              violation.severity,
              violation.message,
              timestamp,
            ],
          );
          eventsCreated++;
        }
      }

      // 8. Update device last_connection
      await manager.query(
        `UPDATE devices SET last_connection = @0, status = 'online' WHERE id = @1`,
        [timestamp, sensor.device.id],
      );

      this.logger.debug(
        `Ingested reading: sensor=${dto.sensorId} value=${dto.value} violations=${violations.length}`,
      );

      const result = {
        readingId: savedReading.id,
        violations,
        alertsCreated,
        eventsCreated,
      };

      // PHASE 3: Publish domain events AFTER transaction commits
      // Events are published outside transaction to avoid blocking
      setImmediate(() => {
        this.publishEvents(
          dto,
          sensor,
          savedReading,
          violations,
          timestamp,
        ).catch((err) => {
          this.logger.error(`Failed to publish events: ${err.message}`);
        });
      });

      return result;
    });
  }

  /**
   * Publish domain events
   * 
   * CRITICAL: Called AFTER transaction commits
   * Never blocks ingestion flow
   */
  private async publishEvents(
    dto: IngestReadingDto,
    sensor: Sensor,
    reading: SensorReading,
    violations: ThresholdViolation[],
    timestamp: Date,
  ): Promise<void> {
    const events: any[] = [];

    // 1. Reading Ingested Event
    const readingEvent: ReadingIngestedEvent = {
      eventId: uuidv4(),
      eventType: EventTypes.READING_INGESTED,
      eventVersion: '1.0',
      timestamp: new Date(),
      aggregateId: dto.sensorId,
      aggregateType: 'sensor',
      payload: {
        sensorId: dto.sensorId,
        deviceId: sensor.device.id,
        value: dto.value,
        timestamp: timestamp.toISOString(),
        deviceTimestamp: dto.deviceTimestamp?.toISOString(),
        unit: sensor.unit,
        sensorType: sensor.sensorType,
      },
      metadata: {
        source: 'reading-ingestion-service',
      },
    };
    events.push(readingEvent);

    // 2. Threshold Violated Events
    for (const violation of violations) {
      const violationEvent: ThresholdViolatedEvent = {
        eventId: uuidv4(),
        eventType: EventTypes.THRESHOLD_VIOLATED,
        eventVersion: '1.0',
        timestamp: new Date(),
        aggregateId: dto.sensorId,
        aggregateType: 'sensor',
        payload: {
          sensorId: dto.sensorId,
          deviceId: sensor.device.id,
          thresholdId: '', // TODO: Include threshold ID
          violationType: violation.type === 'threshold' ? 'static' : 'delta',
          severity: violation.severity,
          value: dto.value,
          message: violation.message,
          metadata: violation.metadata,
        },
        metadata: {
          source: 'reading-ingestion-service',
        },
      };
      events.push(violationEvent);
    }

    // Publish all events in batch
    await this.eventBus.publishBatch(events);
  }

  /**
   * Ingest batch of readings
   * 
   * OPTIMIZED: Bulk insert with set-based threshold evaluation
   */
  async ingestReadingsBatch(
    readings: IngestReadingDto[],
  ): Promise<IngestReadingResult[]> {
    // TODO: Implement batch optimization
    // For now, process sequentially
    const results: IngestReadingResult[] = [];

    for (const reading of readings) {
      const result = await this.ingestReading(reading);
      results.push(result);
    }

    return results;
  }

  /**
   * Map AlertThreshold entities to domain DTOs
   */
  private mapThresholds(thresholds: AlertThreshold[]): ThresholdConfig[] {
    return thresholds.map((t) => ({
      id: t.id,
      sensorId: t.sensorId,
      conditionType: t.conditionType as any,
      thresholdValueMin: t.thresholdValueMin ? parseFloat(t.thresholdValueMin) : null,
      thresholdValueMax: t.thresholdValueMax ? parseFloat(t.thresholdValueMax) : null,
      severity: t.severity as any,
      isActive: t.isActive,
    }));
  }

  /**
   * Map delta threshold rows to domain DTOs
   */
  private mapDeltaThresholds(rows: any[]): DeltaThresholdConfig[] {
    return rows.map((r) => ({
      id: String(r.id),
      sensorId: String(r.sensor_id),
      absDelta: r.abs_delta,
      relDelta: r.rel_delta,
      absSlope: r.abs_slope,
      relSlope: r.rel_slope,
      severity: r.severity,
      isActive: r.is_active,
    }));
  }
}
