import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from '../../entities/sensor.entity';
import { SensorReading } from '../../entities/sensor-reading.entity';
import { Alert } from '../../entities/alert.entity';
import { MlEventActiveView } from '../../entities/views';
import { Prediction } from '../../entities/prediction.entity';
import { AlertThreshold } from '../../entities/alert-threshold.entity';
import { ThresholdService } from '../threshold/threshold.service';
import {
  SensorTelemetryState,
  SensorFinalState,
  evaluateTelemetryState,
} from '../../common/sensor-states';
import { buildConsolidatedStatusResponse } from '../helpers/sensor-status-response.helper';

@Injectable()
export class SensorStatusCoreService {
  constructor(
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(SensorReading)
    private readonly sensorReadingRepo: Repository<SensorReading>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(MlEventActiveView)
    private readonly mlEventActiveViewRepo: Repository<MlEventActiveView>,
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
    private readonly thresholdService: ThresholdService,
  ) {}

  async getSensorConsolidatedStatus(sensorId: number) {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device', 'thresholdProfile'],
    });
    if (!sensor) throw new NotFoundException('Sensor no encontrado');

    const [latestReading, activeAlerts, activeWarnings, latestPrediction, thresholds] = await Promise.all([
      this.sensorReadingRepo.findOne({
        where: { sensor: { id: String(sensorId) } },
        order: { timestamp: 'DESC' },
      }),
      this.alertRepo.find({
        where: { sensor: { id: String(sensorId) }, status: 'active' },
        relations: ['threshold'],
        order: { triggeredAt: 'DESC' },
        take: 5,
      }),
      this.mlEventActiveViewRepo.find({
        where: { sensorId: String(sensorId) },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
      this.predictionRepo.findOne({
        where: { sensor: { id: String(sensorId) } },
        relations: ['model'],
        order: { predictedAt: 'DESC' },
      }),
      this.thresholdService.getSensorThresholds(sensorId),
    ]);

    const warningThreshold = thresholds.find((t) => t.severity === 'warning');
    const alertThreshold = thresholds.find((t) => t.severity === 'critical');

    const currentValue = latestReading?.value !== null && latestReading?.value !== undefined
      ? Number(latestReading.value)
      : null;

    const telemetryState = evaluateTelemetryState(currentValue, {
      warningMin: warningThreshold?.thresholdValueMin !== null ? Number(warningThreshold?.thresholdValueMin) : null,
      warningMax: warningThreshold?.thresholdValueMax !== null ? Number(warningThreshold?.thresholdValueMax) : null,
      alertMin: alertThreshold?.thresholdValueMin !== null ? Number(alertThreshold?.thresholdValueMin) : null,
      alertMax: alertThreshold?.thresholdValueMax !== null ? Number(alertThreshold?.thresholdValueMax) : null,
      warningConditionType: warningThreshold?.conditionType ?? 'out_of_range',
      alertConditionType: alertThreshold?.conditionType ?? 'out_of_range',
    });

    let predictionWouldBreach = false;
    if (latestPrediction) {
      const predValue = Number(latestPrediction.predictedValue);
      const predState = evaluateTelemetryState(predValue, {
        warningMin: warningThreshold?.thresholdValueMin !== null ? Number(warningThreshold?.thresholdValueMin) : null,
        warningMax: warningThreshold?.thresholdValueMax !== null ? Number(warningThreshold?.thresholdValueMax) : null,
        alertMin: alertThreshold?.thresholdValueMin !== null ? Number(alertThreshold?.thresholdValueMin) : null,
        alertMax: alertThreshold?.thresholdValueMax !== null ? Number(alertThreshold?.thresholdValueMax) : null,
        warningConditionType: warningThreshold?.conditionType ?? 'out_of_range',
        alertConditionType: alertThreshold?.conditionType ?? 'out_of_range',
      });
      predictionWouldBreach = predState !== SensorTelemetryState.NORMAL;
    }

    const operationalStateMap: Record<string, string> = {
      INITIALIZING: SensorFinalState.INITIALIZING,
      NORMAL: SensorFinalState.NORMAL,
      WARNING: SensorFinalState.WARNING,
      ALERT: SensorFinalState.ALERT,
      STALE: SensorFinalState.STALE,
    };

    let finalState: string;
    const authoritativeState = sensor.operationalState;

    if (authoritativeState && operationalStateMap[authoritativeState]) {
      finalState = operationalStateMap[authoritativeState];
    } else {
      const DEFAULT_STALE_THRESHOLD_MS = 86400000;
      const staleThresholdMs = sensor.thresholdProfile?.staleThresholdMs
        ? Number(sensor.thresholdProfile.staleThresholdMs)
        : DEFAULT_STALE_THRESHOLD_MS;

      const now = new Date();
      const lastReadingTime = latestReading?.timestamp ? new Date(latestReading.timestamp).getTime() : 0;
      const timeSinceLastReading = now.getTime() - lastReadingTime;
      const isStale = lastReadingTime === 0 || timeSinceLastReading > staleThresholdMs;

      if (isStale) {
        finalState = SensorFinalState.STALE;
      } else if (activeAlerts.length > 0 || telemetryState === SensorTelemetryState.ALERT) {
        finalState = SensorFinalState.ALERT;
      } else if (activeWarnings.length > 0 || telemetryState === SensorTelemetryState.WARNING) {
        finalState = SensorFinalState.WARNING;
      } else if (latestPrediction && predictionWouldBreach) {
        finalState = SensorFinalState.PREDICTION;
      } else {
        finalState = SensorFinalState.NORMAL;
      }
    }

    return buildConsolidatedStatusResponse(
      sensor,
      latestReading,
      activeAlerts,
      activeWarnings,
      latestPrediction,
      thresholds,
      finalState,
    );
  }
}
