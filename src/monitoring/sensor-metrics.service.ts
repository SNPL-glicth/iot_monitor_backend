import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sensor } from '../entities/sensor.entity';
import { SensorReading } from '../entities/sensor-reading.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';

/**
 * Servicio dedicado a métricas y lecturas de sensores.
 * SOLID-SRP: Agregaciones, lecturas crudas e históricas — nada de alertas ni thresholds.
 */
@Injectable()
export class SensorMetricsService {
  private readonly logger = new Logger(SensorMetricsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(SensorReading)
    private readonly sensorReadingRepo: Repository<SensorReading>,
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
  ) {}

  async getSensorMetrics(sensorId: number, window = '1h') {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
    });
    if (!sensor) throw new NotFoundException('Sensor no encontrado');

    const windowMap: Record<string, number> = {
      '1h': 1,
      '6h': 6,
      '12h': 12,
      '24h': 24,
      '7d': 168,
    };
    const hours = windowMap[window] || 1;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const aggResult = await this.dataSource.query(
      `SELECT
         COUNT(*) AS cnt,
         MIN(CAST(value AS FLOAT)) AS min_val,
         MAX(CAST(value AS FLOAT)) AS max_val,
         AVG(CAST(value AS FLOAT)) AS avg_val
       FROM sensor_readings WITH (NOLOCK)
       WHERE sensor_id = @0 AND [timestamp] >= @1`,
      [sensorId, since],
    );

    const agg = aggResult?.[0];
    const count = Number(agg?.cnt ?? 0);

    if (count === 0) {
      return { sensorId, window, count: 0, min: null, max: null, avg: null, readings: [] };
    }

    const maxReadings = 500;
    const readings = await this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('r.timestamp >= :since', { since })
      .orderBy('r.timestamp', 'DESC')
      .take(maxReadings)
      .getMany();
    readings.reverse();

    return {
      sensorId,
      window,
      count,
      min: agg.min_val !== null ? Number(agg.min_val) : null,
      max: agg.max_val !== null ? Number(agg.max_val) : null,
      avg: agg.avg_val !== null ? Math.round(Number(agg.avg_val) * 100) / 100 : null,
      readings: readings.map((r) => ({
        value: r.value,
        timestamp: this.formatDateTime(r.timestamp),
      })),
    };
  }

  async getRawSensorReadings(sensorId: number, limit = 500, since?: string) {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });
    if (!sensor) throw new NotFoundException('Sensor no encontrado');

    const qb = this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) });

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        qb.andWhere('r.timestamp >= :since', { since: sinceDate });
      }
    }

    const readings = await qb.orderBy('r.timestamp', 'ASC').limit(limit).getMany();

    return {
      sensorId: String(sensorId),
      sensorName: sensor.name,
      deviceName: sensor.device?.name ?? '',
      unit: sensor.unit,
      count: readings.length,
      readings: readings.map((r) => ({
        id: r.id,
        value: Number(r.value),
        timestamp: r.timestamp.toISOString(),
        timestampFormatted: this.formatDateTime(r.timestamp),
      })),
    };
  }

  async getAggregatedSensorReadings(sensorId: number, range = '6h') {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });
    if (!sensor) throw new NotFoundException('Sensor no encontrado');

    const config: Record<string, { hours: number; table: string; bucketLabel: string }> = {
      '1h': { hours: 1, table: 'sensor_readings_1m', bucketLabel: '1 minuto' },
      '6h': { hours: 6, table: 'sensor_readings_5m', bucketLabel: '5 minutos' },
      '24h': { hours: 24, table: 'sensor_readings_1h', bucketLabel: '1 hora' },
      '7d': { hours: 168, table: 'sensor_readings_1h', bucketLabel: '1 hora' },
    };

    const cfg = config[range] || config['6h'];
    const since = new Date(Date.now() - cfg.hours * 60 * 60 * 1000);

    let aggregatedData: any[] = [];
    try {
      aggregatedData = await this.dataSource.query(
        `SELECT 
           sensor_id,
           bucket_ts,
           avg_value,
           min_value,
           max_value,
           samples
         FROM ${cfg.table} WITH (NOLOCK)
         WHERE sensor_id = @0 AND bucket_ts >= @1
         ORDER BY bucket_ts ASC`,
        [sensorId, since],
      );
    } catch {
      aggregatedData = [];
    }

    if (aggregatedData.length === 0) {
      const bucketMinutes =
        range === '1h' ? 1 : range === '6h' ? 5 : range === '24h' ? 60 : 60;

      const rawAgg = await this.dataSource.query(
        `SELECT 
           sensor_id,
           DATEADD(minute, (DATEDIFF(minute, 0, [timestamp]) / @2) * @2, 0) AS bucket_ts,
           AVG(CAST(value AS FLOAT)) AS avg_value,
           MIN(CAST(value AS FLOAT)) AS min_value,
           MAX(CAST(value AS FLOAT)) AS max_value,
           COUNT(*) AS samples
         FROM sensor_readings WITH (NOLOCK)
         WHERE sensor_id = @0 AND [timestamp] >= @1
         GROUP BY sensor_id, DATEADD(minute, (DATEDIFF(minute, 0, [timestamp]) / @2) * @2, 0)
         ORDER BY bucket_ts ASC`,
        [sensorId, since, bucketMinutes],
      );
      aggregatedData = rawAgg;
    }

    return {
      sensorId: String(sensorId),
      sensorName: sensor.name,
      deviceName: sensor.device?.name ?? '',
      unit: sensor.unit,
      range,
      bucketLabel: cfg.bucketLabel,
      count: aggregatedData.length,
      series: aggregatedData.map((row: any) => ({
        timestamp:
          row.bucket_ts instanceof Date ? row.bucket_ts.toISOString() : row.bucket_ts,
        avg: Number(row.avg_value),
        min: Number(row.min_value),
        max: Number(row.max_value),
        samples: Number(row.samples),
      })),
    };
  }

  async getHistoricalReadings(sensorId: number, from: string, to: string, limit = 500) {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });
    if (!sensor) throw new NotFoundException('Sensor no encontrado');

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Fechas inválidas. Usar formato ISO 8601.');
    }

    const readings = await this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('r.timestamp >= :from', { from: fromDate })
      .andWhere('r.timestamp <= :to', { to: toDate })
      .orderBy('r.timestamp', 'ASC')
      .take(limit)
      .getMany();

    const allThresholds = await this.thresholdRepo.find({
      where: { sensor: { id: String(sensorId) }, isActive: true },
    });

    const warningThreshold = allThresholds.find((t) => t.severity === 'warning');
    const alertThreshold = allThresholds.find((t) => t.severity === 'critical');

    const thresholdData = {
      alertMin: alertThreshold?.thresholdValueMin ? Number(alertThreshold.thresholdValueMin) : null,
      alertMax: alertThreshold?.thresholdValueMax ? Number(alertThreshold.thresholdValueMax) : null,
      warningMin: warningThreshold?.thresholdValueMin ? Number(warningThreshold.thresholdValueMin) : null,
      warningMax: warningThreshold?.thresholdValueMax ? Number(warningThreshold.thresholdValueMax) : null,
    };

    return {
      sensorId: String(sensorId),
      sensorName: sensor.name,
      deviceName: sensor.device?.name ?? '',
      unit: sensor.unit,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      count: readings.length,
      thresholds: thresholdData,
      series: readings.map((r) => ({
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
        value: Number(r.value),
        state: this.classifyReadingState(Number(r.value), thresholdData),
      })),
    };
  }

  private classifyReadingState(
    value: number,
    thresholds: {
      alertMin: number | null;
      alertMax: number | null;
      warningMin: number | null;
      warningMax: number | null;
    },
  ): string {
    if (thresholds.alertMin !== null && value < thresholds.alertMin) return 'ALERT';
    if (thresholds.alertMax !== null && value > thresholds.alertMax) return 'ALERT';
    if (thresholds.warningMin !== null && value < thresholds.warningMin) return 'WARNING';
    if (thresholds.warningMax !== null && value > thresholds.warningMax) return 'WARNING';
    return 'NORMAL';
  }

  private formatDateTime(value: Date | string | null): string | null {
    if (!value) return null;
    const date = typeof value === 'string' ? new Date(value) : value;
    return date.toISOString();
  }
}
