import { Injectable } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class SensorThresholdService {
  constructor(private readonly monitoring: MonitoringService) {}

  async getSensorThresholds(sensorId: number) { return this.monitoring.getSensorThresholds(sensorId); }
  async createSensorThreshold(sensorId: number, data: any) { return this.monitoring.createSensorThreshold(sensorId, data); }
  async updateThreshold(thresholdId: number, userId: string, data: any) { return this.monitoring.updateThreshold(thresholdId, userId, data); }
  async deactivateThreshold(thresholdId: number, userId: string, reason: string | null) { return this.monitoring.deactivateThreshold(thresholdId, userId, reason); }
  async getThresholdHistory(thresholdId: number) { return this.monitoring.getThresholdHistory(thresholdId); }
  async getSensorThresholdsCanonical(sensorId: number) { return this.monitoring.getSensorThresholdsCanonical(sensorId); }
  async getSensorAlertsHistory(sensorId: number, limit = 50) { return this.monitoring.getSensorAlertsHistory(sensorId, limit); }
  async getSensorThresholdProfile(sensorId: number) { return this.monitoring.getSensorThresholdProfile(sensorId); }
  async upsertSensorThresholdProfile(sensorId: number, data: any) { return this.monitoring.upsertSensorThresholdProfile(sensorId, data); }
}
