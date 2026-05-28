import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorReading } from '../../entities/sensor-reading.entity';
import { AlertThreshold } from '../../entities/alert-threshold.entity';
import { parseRangeToMs } from '../../shared/date-format.util';

@Injectable()
export class SensorDebugChartService {
  constructor(
    @InjectRepository(SensorReading)
    private readonly sensorReadingRepo: Repository<SensorReading>,
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
  ) {}

  async debugChartData(sensorId: number, range: string) {
    const now = new Date();
    const rangeMs = parseRangeToMs(range);
    const since = new Date(now.getTime() - rangeMs);

    const readings = await this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('r.timestamp >= :since', { since })
      .orderBy('r.timestamp', 'ASC')
      .take(2000)
      .getMany();

    const thresholds = await this.thresholdRepo.find({
      where: { sensor: { id: String(sensorId) }, isActive: true },
    });

    const warningThreshold = thresholds.find((t) => t.severity === 'warning');
    const alertThreshold = thresholds.find((t) => t.severity === 'critical');

    const values = readings.map((r) => Number(r.value));
    const timestamps = readings.map((r) =>
      r.timestamp instanceof Date ? r.timestamp.getTime() : new Date(r.timestamp).getTime()
    );

    const uniqueTs = new Set(timestamps);
    const duplicateCount = timestamps.length - uniqueTs.size;

    const alertMax = alertThreshold?.thresholdValueMax ? Number(alertThreshold.thresholdValueMax) : null;
    const alertMin = alertThreshold?.thresholdValueMin ? Number(alertThreshold.thresholdValueMin) : null;

    let alertPoints = 0;
    let warningPoints = 0;
    let normalPoints = 0;

    for (const v of values) {
      if ((alertMax !== null && v > alertMax) || (alertMin !== null && v < alertMin)) {
        alertPoints++;
      } else if (warningThreshold) {
        const wMax = warningThreshold.thresholdValueMax ? Number(warningThreshold.thresholdValueMax) : null;
        const wMin = warningThreshold.thresholdValueMin ? Number(warningThreshold.thresholdValueMin) : null;
        if ((wMax !== null && v > wMax) || (wMin !== null && v < wMin)) {
          warningPoints++;
        } else {
          normalPoints++;
        }
      } else {
        normalPoints++;
      }
    }

    return {
      sensorId,
      range,
      timestamp: now.toISOString(),
      dataAnalysis: {
        totalPoints: readings.length,
        duplicateTimestamps: duplicateCount,
        alertPoints,
        warningPoints,
        normalPoints,
        valueRange: values.length > 0 ? {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
        } : null,
        timeRange: timestamps.length > 0 ? {
          from: new Date(Math.min(...timestamps)).toISOString(),
          to: new Date(Math.max(...timestamps)).toISOString(),
          spanMinutes: Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000),
        } : null,
      },
      thresholds: {
        alertMin,
        alertMax,
        warningMin: warningThreshold?.thresholdValueMin ? Number(warningThreshold.thresholdValueMin) : null,
        warningMax: warningThreshold?.thresholdValueMax ? Number(warningThreshold.thresholdValueMax) : null,
      },
      sample: readings.slice(0, 5).map((r) => ({
        timestamp: r.timestamp,
        value: Number(r.value),
      })),
      issues: [
        ...(duplicateCount > 0 ? [`${duplicateCount} duplicate timestamps - may cause stacked points`] : []),
        ...(alertPoints > 10 ? [`${alertPoints} alert points - may cause visual clutter`] : []),
        ...(readings.length === 0 ? ['NO DATA for this range'] : []),
      ],
    };
  }
}
