import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sensor } from '../../entities/sensor.entity';
import { SensorReading } from '../../entities/sensor-reading.entity';
import { AlertThreshold } from '../../entities/alert-threshold.entity';
import { Alert } from '../../entities/alert.entity';
import { MlEventActiveView } from '../../entities/views';
import { evaluateTelemetryState } from '../../common/sensor-states';
import { buildDashboardSeries } from '../helpers/sensor-dashboard-series.helper';
import { getDeltaThresholdForSensor } from '../helpers/sensor-dashboard-delta.helper';

@Injectable()
export class SensorDashboardService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(SensorReading)
    private readonly sensorReadingRepo: Repository<SensorReading>,
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(MlEventActiveView)
    private readonly mlEventActiveViewRepo: Repository<MlEventActiveView>,
  ) {}

  async getSensorDashboard(sensorId: number, range = '6h') {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });
    if (!sensor) throw new NotFoundException('Sensor no encontrado');

    const windowMap: Record<string, { hours: number; bucketMinutes: number }> = {
      '1h': { hours: 1, bucketMinutes: 5 },
      '6h': { hours: 6, bucketMinutes: 15 },
      '12h': { hours: 12, bucketMinutes: 30 },
      '24h': { hours: 24, bucketMinutes: 60 },
      '7d': { hours: 168, bucketMinutes: 360 },
    };
    const config = windowMap[range] || windowMap['6h'];
    const since = new Date(Date.now() - config.hours * 60 * 60 * 1000);

    const latestReading = await this.sensorReadingRepo.findOne({
      where: { sensor: { id: String(sensorId) } },
      order: { timestamp: 'DESC' },
    });

    const maxSeriesPoints = 2000;
    const readings = await this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('r.timestamp >= :since', { since })
      .orderBy('r.timestamp', 'ASC')
      .take(maxSeriesPoints)
      .getMany();

    const initialReading = await this.sensorReadingRepo
      .createQueryBuilder('r')
      .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('r.timestamp < :since', { since })
      .orderBy('r.timestamp', 'DESC')
      .limit(1)
      .getOne();

    const thresholds = await this.thresholdRepo.find({
      where: { sensorId: String(sensorId), isActive: true },
    });

    const warningThreshold = thresholds.find((t) => t.severity === 'warning');
    const alertThreshold = thresholds.find((t) => t.severity === 'critical');

    const canonicalThresholds = {
      warning: {
        min: warningThreshold?.thresholdValueMin ? Number(warningThreshold.thresholdValueMin) : null,
        max: warningThreshold?.thresholdValueMax ? Number(warningThreshold.thresholdValueMax) : null,
        conditionType: warningThreshold?.conditionType ?? 'out_of_range',
      },
      alert: {
        min: alertThreshold?.thresholdValueMin ? Number(alertThreshold.thresholdValueMin) : null,
        max: alertThreshold?.thresholdValueMax ? Number(alertThreshold.thresholdValueMax) : null,
        conditionType: alertThreshold?.conditionType ?? 'out_of_range',
      },
    };

    const currentValue = latestReading ? Number(latestReading.value) : null;
    const state = evaluateTelemetryState(currentValue, {
      warningMin: canonicalThresholds.warning.min,
      warningMax: canonicalThresholds.warning.max,
      alertMin: canonicalThresholds.alert.min,
      alertMax: canonicalThresholds.alert.max,
      warningConditionType: canonicalThresholds.warning.conditionType,
      alertConditionType: canonicalThresholds.alert.conditionType,
    });

    const activeCritical = await this.alertRepo
      .createQueryBuilder('a')
      .where('a.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('a.status IN (:...statuses)', { statuses: ['active', 'acknowledged'] })
      .andWhere('a.severity = :severity', { severity: 'critical' })
      .getCount();

    const activeWarning = await this.alertRepo
      .createQueryBuilder('a')
      .where('a.sensor_id = :sensorId', { sensorId: String(sensorId) })
      .andWhere('a.status IN (:...statuses)', { statuses: ['active', 'acknowledged'] })
      .andWhere('a.severity = :severity', { severity: 'warning' })
      .getCount();

    const latestMlEvent = await this.mlEventActiveViewRepo
      .createQueryBuilder('e')
      .where('e.sensorId = :sid', { sid: String(sensorId) })
      .andWhere("e.eventCode <> 'DELTA_SPIKE'")
      .orderBy('e.createdAt', 'DESC')
      .limit(1)
      .getOne();

    const deltaThreshold = await getDeltaThresholdForSensor(this.dataSource, sensorId);

    const series = buildDashboardSeries(readings, canonicalThresholds);

    const operationalState = {
      state: sensor.operationalState ?? 'UNKNOWN',
      stateSince: sensor.stateChangedAt?.toISOString() ?? null,
      validReadingsCount: sensor.validReadingsCount ?? 0,
      minReadingsForNormal: sensor.minReadingsForNormal ?? 10,
      canGenerateEvents: ['NORMAL', 'WARNING', 'ALERT'].includes(sensor.operationalState ?? ''),
    };

    return {
      sensorId: String(sensorId),
      metrics: {
        sensorId: String(sensorId),
        currentValue,
        currentTimestamp: latestReading?.timestamp?.toISOString() ?? null,
        state,
        thresholds: canonicalThresholds,
        prediction: null,
        operationalState,
      },
      mlEvent: latestMlEvent
        ? {
            eventId: String(latestMlEvent.eventId),
            eventType: String(latestMlEvent.eventType),
            eventCode: String(latestMlEvent.eventCode),
            title: latestMlEvent.title,
            message: latestMlEvent.message,
            createdAt: latestMlEvent.createdAt?.toISOString?.() ?? null,
            payload: latestMlEvent.payload,
          }
        : null,
      trading: {
        sensorId: String(sensorId),
        range,
        bucketMinutes: config.bucketMinutes,
        initialValue: initialReading ? Number(initialReading.value) : null,
        initialReadingTimestamp: initialReading?.timestamp?.toISOString() ?? null,
        thresholds: canonicalThresholds,
        series,
      },
      alerts: {
        activeCritical,
        activeWarning,
      },
    };
  }
}
