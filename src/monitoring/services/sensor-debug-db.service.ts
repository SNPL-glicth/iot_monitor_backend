import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../../entities/device.entity';
import { Sensor } from '../../entities/sensor.entity';
import { SensorReading } from '../../entities/sensor-reading.entity';
import { Alert } from '../../entities/alert.entity';
import { AlertThreshold } from '../../entities/alert-threshold.entity';

@Injectable()
export class SensorDebugDbService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(SensorReading)
    private readonly sensorReadingRepo: Repository<SensorReading>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
  ) {}

  async getDbDebug(sensorId?: string) {
    const info: any = {
      timestamp: new Date().toISOString(),
    };

    if (sensorId) {
      const sensor = await this.sensorRepo.findOne({
        where: { id: sensorId },
        relations: ['device'],
      });
      info.sensor = sensor ?? 'not_found';

      const readingCount = await this.sensorReadingRepo.count({
        where: { sensor: { id: sensorId } },
      });
      info.readingCount = readingCount;

      const alertCount = await this.alertRepo.count({
        where: { sensor: { id: sensorId } },
      });
      info.alertCount = alertCount;

      const thresholds = await this.thresholdRepo.find({
        where: { sensorId: String(sensorId) },
      });
      info.thresholds = thresholds.map((t) => ({
        id: t.id,
        severity: t.severity,
        conditionType: t.conditionType,
        min: t.thresholdValueMin,
        max: t.thresholdValueMax,
        isActive: t.isActive,
      }));

      const latestReading = await this.sensorReadingRepo
        .createQueryBuilder('r')
        .where('r.sensor_id = :sid', { sid: sensorId })
        .orderBy('r.timestamp', 'DESC')
        .limit(1)
        .getOne();
      info.latestReading = latestReading ? {
        value: latestReading.value,
        timestamp: latestReading.timestamp,
      } : null;

      if (latestReading && thresholds.length > 0) {
        const warningThreshold = thresholds.find((t) => t.severity === 'warning' && t.isActive);
        const alertThreshold = thresholds.find((t) => t.severity === 'critical' && t.isActive);

        const value = Number(latestReading.value);
        info.evaluation = {
          value,
          warningThreshold: warningThreshold ? {
            min: warningThreshold.thresholdValueMin,
            max: warningThreshold.thresholdValueMax,
            conditionType: warningThreshold.conditionType,
          } : null,
          alertThreshold: alertThreshold ? {
            min: alertThreshold.thresholdValueMin,
            max: alertThreshold.thresholdValueMax,
            conditionType: alertThreshold.conditionType,
          } : null,
          alertViolated: alertThreshold ? (
            (alertThreshold.thresholdValueMin && value < Number(alertThreshold.thresholdValueMin)) ||
            (alertThreshold.thresholdValueMax && value > Number(alertThreshold.thresholdValueMax))
          ) : false,
          warningViolated: warningThreshold ? (
            (warningThreshold.thresholdValueMin && value < Number(warningThreshold.thresholdValueMin)) ||
            (warningThreshold.thresholdValueMax && value > Number(warningThreshold.thresholdValueMax))
          ) : false,
        };
      }

      const activeAlerts = await this.alertRepo.find({
        where: { sensor: { id: sensorId }, status: 'active' },
      });
      info.activeAlerts = activeAlerts.map((a) => ({
        id: a.id,
        severity: a.severity,
        status: a.status,
        triggeredValue: a.triggeredValue,
        triggeredAt: a.triggeredAt,
      }));
    } else {
      info.totalDevices = await this.deviceRepo.count();
      info.totalSensors = await this.sensorRepo.count();
      info.totalReadings = await this.sensorReadingRepo.count();
      info.totalAlerts = await this.alertRepo.count();
    }

    return info;
  }
}
