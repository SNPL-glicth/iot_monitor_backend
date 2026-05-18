/**
 * TelemetryMLAdapter
 * 
 * PHASE 4 FIX: Adapter for transforming telemetry data to ML format
 * and sending to ML service.
 * 
 * Responsibilities:
 * - Fetch telemetry data from SQL Server
 * - Transform to ML ingestion format
 * - Send to ML service via HTTP
 * - Handle type conversions (bigint to int)
 * - Logging and observability
 */

import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface TelemetryMetrics {
  sensor_id: number;
  range_key: string;
  computed_at: Date;
  min_value: number | null;
  max_value: number | null;
  fluctuation: number | null;
  points_count: number;
  warning_min: number | null;
  warning_max: number | null;
  alert_min: number | null;
  alert_max: number | null;
}

interface MLIngestionPayload {
  sensor_id: number;
  values: number[];
  timestamps: string[];
  source: 'telemetry';
}

interface TelemetryMLAdapterResponse {
  success: boolean;
  data?: any;
  error?: string;
  latency_ms?: number;
}

@Injectable()
export class TelemetryMLAdapter {
  private readonly logger = new Logger(TelemetryMLAdapter.name);
  private readonly mlServiceUrl: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly httpService: HttpService,
  ) {
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
  }

  /**
   * Fetch latest telemetry metrics for a sensor
   */
  async fetchLatestMetrics(sensorId: number): Promise<TelemetryMetrics | null> {
    const query = `
      SELECT TOP 1
        sensor_id,
        range_key,
        computed_at,
        min_value,
        max_value,
        fluctuation,
        points_count,
        warning_min,
        warning_max,
        alert_min,
        alert_max
      FROM telemetry_sensor_metrics
      WHERE sensor_id = @0
      ORDER BY computed_at DESC
    `;

    try {
      const result = await this.dataSource.query(query, [sensorId]);
      
      if (result.length === 0) {
        this.logger.warn(`No telemetry metrics found for sensor_id=${sensorId}`);
        return null;
      }

      const row = result[0];
      
      // PHASE 4 FIX: Convert bigint sensor_id to number
      const metrics: TelemetryMetrics = {
        sensor_id: Number(row.sensor_id),
        range_key: row.range_key,
        computed_at: row.computed_at,
        min_value: row.min_value !== null ? Number(row.min_value) : null,
        max_value: row.max_value !== null ? Number(row.max_value) : null,
        fluctuation: row.fluctuation !== null ? Number(row.fluctuation) : null,
        points_count: row.points_count,
        warning_min: row.warning_min !== null ? Number(row.warning_min) : null,
        warning_max: row.warning_max !== null ? Number(row.warning_max) : null,
        alert_min: row.alert_min !== null ? Number(row.alert_min) : null,
        alert_max: row.alert_max !== null ? Number(row.alert_max) : null,
      };

      this.logger.log(
        `Fetched telemetry metrics: sensor_id=${metrics.sensor_id}, points_count=${metrics.points_count}`
      );

      return metrics;
    } catch (error) {
      this.logger.error(
        `Error fetching telemetry metrics for sensor_id=${sensorId}: ${error}`,
        error instanceof Error ? error.stack : undefined
      );
      return null;
    }
  }

  /**
   * Transform telemetry metrics to ML ingestion format
   */
  transformToMLFormat(metrics: TelemetryMetrics): MLIngestionPayload {
    // PHASE 4 FIX: ML ingestion contract - values array from metrics
    // Use min_value, max_value, fluctuation as feature vector
    const values: number[] = [];
    
    if (metrics.min_value !== null) values.push(metrics.min_value);
    if (metrics.max_value !== null) values.push(metrics.max_value);
    if (metrics.fluctuation !== null) values.push(metrics.fluctuation);
    
    // Add threshold features if available
    if (metrics.warning_min !== null) values.push(metrics.warning_min);
    if (metrics.warning_max !== null) values.push(metrics.warning_max);
    if (metrics.alert_min !== null) values.push(metrics.alert_min);
    if (metrics.alert_max !== null) values.push(metrics.alert_max);

    // Add points_count as feature
    values.push(metrics.points_count);

    const payload: MLIngestionPayload = {
      sensor_id: metrics.sensor_id,
      values: values,
      timestamps: [metrics.computed_at.toISOString()],
      source: 'telemetry',
    };

    this.logger.log(
      `Transformed telemetry to ML format: sensor_id=${payload.sensor_id}, features_count=${values.length}`
    );

    return payload;
  }

  /**
   * Send data to ML service
   */
  async sendToMLService(payload: MLIngestionPayload): Promise<TelemetryMLAdapterResponse> {
    const startTime = Date.now();
    const url = `${this.mlServiceUrl}/ml/predict`;

    try {
      this.logger.log(
        `Sending telemetry data to ML service: sensor_id=${payload.sensor_id}, url=${url}`
      );

      const response = await firstValueFrom(this.httpService.post(url, payload));
      
      const latency_ms = Date.now() - startTime;

      this.logger.log(
        `ML service response: sensor_id=${payload.sensor_id}, status=${response.status}, latency=${latency_ms}ms`
      );

      return {
        success: true,
        data: response.data,
        latency_ms,
      };
    } catch (error) {
      const latency_ms = Date.now() - startTime;
      
      this.logger.error(
        `Error sending telemetry data to ML service: sensor_id=${payload.sensor_id}, latency=${latency_ms}ms, error=${error}`,
        error instanceof Error ? error.stack : undefined
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latency_ms,
      };
    }
  }

  /**
   * End-to-end: fetch, transform, and send telemetry data to ML
   */
  async processTelemetryForML(sensorId: number): Promise<TelemetryMLAdapterResponse> {
    this.logger.log(`Processing telemetry for ML: sensor_id=${sensorId}`);

    // Step 1: Fetch telemetry metrics
    const metrics = await this.fetchLatestMetrics(sensorId);
    
    if (!metrics) {
      return {
        success: false,
        error: 'No telemetry metrics found for sensor',
      };
    }

    // Step 2: Transform to ML format
    const payload = this.transformToMLFormat(metrics);

    // Step 3: Send to ML service
    const response = await this.sendToMLService(payload);

    return response;
  }
}
