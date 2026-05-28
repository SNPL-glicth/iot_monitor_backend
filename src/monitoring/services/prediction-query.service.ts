import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { formatDateTime } from '../../shared/date-format.util';

/**
 * PredictionQueryService — Consulta de predicciones ML y health del sistema ML.
 *
 * SOLID-SRP: Solo lectura de predicciones. Sin mutación de estado.
 */
@Injectable()
export class PredictionQueryService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Devuelve las últimas predicciones generadas por modelos ML.
   * Deduplicación por sensor (ROW_NUMBER).
   */
  async getLatestPredictions(limit = 50) {
    const rows = await this.dataSource.query(
      `
      WITH RankedPredictions AS (
        SELECT 
          p.id,
          p.predicted_value,
          p.confidence,
          p.predicted_at,
          p.target_timestamp,
          p.sensor_id,
          p.model_id,
          s.name AS sensor_name,
          s.unit,
          d.name AS device_name,
          m.model_name,
          m.version AS model_version,
          ROW_NUMBER() OVER (PARTITION BY p.sensor_id ORDER BY p.predicted_at DESC) as rn
        FROM predictions p
        INNER JOIN sensors s ON p.sensor_id = s.id
        LEFT JOIN devices d ON s.device_id = d.id
        LEFT JOIN ml_models m ON p.model_id = m.id
        WHERE p.target_timestamp > GETDATE()
      )
      SELECT TOP (@0) * FROM RankedPredictions WHERE rn = 1
      ORDER BY target_timestamp ASC
    `,
      [limit],
    );

    return rows.map((p: any) => ({
      id: p.id,
      predictedValue: p.predicted_value,
      confidence: p.confidence,
      predictedAt: formatDateTime(p.predicted_at),
      targetTimestamp: formatDateTime(p.target_timestamp),
      sensorName: p.sensor_name,
      unit: p.unit,
      deviceName: p.device_name ?? '',
      modelName: p.model_name,
      modelVersion: p.model_version,
      sensorId: p.sensor_id,
    }));
  }

  /**
   * Estado general del sistema de ML para observabilidad.
   */
  async getMlHealth(): Promise<{
    status: string;
    lastRunAt: string;
    sensorsAnalyzed: number;
    sensorsOmitted: number;
    reasonsOmitted: { reason: string; count: number }[];
  }> {
    const lastPrediction = await this.dataSource.query(`
      SELECT TOP 1 predicted_at
      FROM predictions
      ORDER BY predicted_at DESC
    `);
    const lastRunAt = lastPrediction?.[0]?.predicted_at?.toISOString?.() ?? '';

    const sensorsWithPredictions = await this.dataSource.query(`
      SELECT COUNT(DISTINCT sensor_id) as cnt
      FROM predictions
      WHERE predicted_at >= DATEADD(day, -1, GETDATE())
    `);
    const sensorsAnalyzed = Number(sensorsWithPredictions?.[0]?.cnt ?? 0);

    const totalSensors = await this.dataSource.query(`
      SELECT COUNT(*) as cnt FROM sensors WHERE is_active = 1
    `);
    const totalActive = Number(totalSensors?.[0]?.cnt ?? 0);
    const sensorsOmitted = Math.max(0, totalActive - sensorsAnalyzed);

    const reasonsOmitted: { reason: string; count: number }[] = [];
    if (sensorsOmitted > 0) {
      const noRecentReadings = await this.dataSource.query(`
        SELECT COUNT(*) as cnt
        FROM sensors s
        WHERE s.is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM sensor_readings sr
            WHERE sr.sensor_id = s.id
              AND sr.timestamp >= DATEADD(hour, -24, GETDATE())
          )
      `);
      const noDataCount = Number(noRecentReadings?.[0]?.cnt ?? 0);
      if (noDataCount > 0) {
        reasonsOmitted.push({ reason: 'Sin lecturas en 24h', count: noDataCount });
      }
    }

    const isOk = sensorsAnalyzed > 0 && lastRunAt !== '';
    const status = isOk ? 'OK' : 'DEGRADED';

    return {
      status,
      lastRunAt,
      sensorsAnalyzed,
      sensorsOmitted,
      reasonsOmitted,
    };
  }
}
