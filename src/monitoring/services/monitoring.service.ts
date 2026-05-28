import { Injectable } from '@nestjs/common';
import { ThresholdService } from '../threshold/threshold.service';
import { DeviceQueryService } from './device-query.service';
import { SensorReadingQueryService } from './sensor-reading-query.service';
import { AlertQueryService } from './alert-query.service';
import { PredictionQueryService } from './prediction-query.service';
import { SensorMetricsService } from './sensor-metrics.service';
import { AlertMaintenanceService } from './alert-maintenance.service';
import { DevToolsService } from './dev-tools.service';
import { SensorDashboardService } from './sensor-dashboard.service';
import { SensorStatusCoreService } from './sensor-status-core.service';
import { SensorStatusBatchService } from './sensor-status-batch.service';
import { SensorDebugCoreService } from './sensor-debug-core.service';
import { SensorDebugTelemetryService } from './sensor-debug-telemetry.service';
import { SensorDebugChartService } from './sensor-debug-chart.service';
import { SensorDebugDbService } from './sensor-debug-db.service';
import { SensorManagementService } from './sensor-management.service';

@Injectable()
export class MonitoringService {
  constructor(
    private readonly thresholdService: ThresholdService,
    private readonly deviceQueryService: DeviceQueryService,
    private readonly sensorReadingQueryService: SensorReadingQueryService,
    private readonly alertQueryService: AlertQueryService,
    private readonly predictionQueryService: PredictionQueryService,
    private readonly sensorMetricsService: SensorMetricsService,
    private readonly alertMaintenanceService: AlertMaintenanceService,
    private readonly devToolsService: DevToolsService,
    private readonly sensorDashboardService: SensorDashboardService,
    private readonly sensorStatusCoreService: SensorStatusCoreService,
    private readonly sensorStatusBatchService: SensorStatusBatchService,
    private readonly sensorDebugCoreService: SensorDebugCoreService,
    private readonly sensorDebugTelemetryService: SensorDebugTelemetryService,
    private readonly sensorDebugChartService: SensorDebugChartService,
    private readonly sensorDebugDbService: SensorDebugDbService,
    private readonly sensorManagementService: SensorManagementService,
  ) {}

  async getDevicesWithSensors() { return this.deviceQueryService.getDevicesWithSensors(); }
  async getLatestSensorReadings() { return this.sensorReadingQueryService.getLatestSensorReadings(); }
  async getActiveAlerts(limit = 100) { return this.alertQueryService.getActiveAlerts(limit); }
  async getActiveMlEvents(limit = 50) { return this.alertQueryService.getActiveMlEvents(limit); }
  async getLatestPredictions(limit = 50) { return this.predictionQueryService.getLatestPredictions(limit); }
  async insertSensorReading(sensorId: number, value: number) { return this.sensorReadingQueryService.insertSensorReading(sensorId, value); }
  async getDeviceById(id: number) { return this.deviceQueryService.getDeviceById(id); }
  async getSensorReadings(sensorId: number, limit = 100) { return this.sensorReadingQueryService.getSensorReadings(sensorId, limit); }
  async getSensorThresholds(sensorId: number) { return this.thresholdService.getSensorThresholds(sensorId); }
  async createSensorThreshold(sensorId: number, body: any) { return this.thresholdService.createSensorThreshold(sensorId, body); }
  async updateThreshold(thresholdId: number, changedByUserId: string, body: any) { return this.thresholdService.updateThreshold(thresholdId, changedByUserId, body); }
  async deactivateThreshold(thresholdId: number, changedByUserId: string, reason?: string | null) { return this.thresholdService.deactivateThreshold(thresholdId, changedByUserId, reason); }
  async getThresholdHistory(thresholdId: number) { return this.thresholdService.getThresholdHistory(thresholdId); }
  async getSensorThresholdsCanonical(sensorId: number) { return this.thresholdService.getSensorThresholdsCanonical(sensorId); }
  async getSensorAlertsHistory(sensorId: number, limit = 50) { return this.alertQueryService.getSensorAlertsHistory(sensorId, limit); }
  async getSensorThresholdProfile(sensorId: number) { return this.thresholdService.getSensorThresholdProfile(sensorId); }
  async upsertSensorThresholdProfile(sensorId: number, body: any) { return this.thresholdService.upsertSensorThresholdProfile(sensorId, body); }
  async getMlHealth() { return this.predictionQueryService.getMlHealth(); }
  async getRawSensorReadings(sensorId: number, limit = 500, since?: string) { return this.sensorMetricsService.getRawSensorReadings(sensorId, limit, since); }
  async getAggregatedSensorReadings(sensorId: number, range = '6h') { return this.sensorMetricsService.getAggregatedSensorReadings(sensorId, range); }
  async getHistoricalReadings(sensorId: number, from: string, to: string, limit = 500) { return this.sensorMetricsService.getHistoricalReadings(sensorId, from, to, limit); }
  async getAllSensorsConsolidatedStatus() { return this.sensorStatusBatchService.getAllSensorsConsolidatedStatus(); }
  async getSensorConsolidatedStatus(sensorId: number) { return this.sensorStatusCoreService.getSensorConsolidatedStatus(sensorId); }
  async getSensorConsolidatedStatusBatch(idsRaw: string) { return this.sensorStatusBatchService.getSensorConsolidatedStatusBatch(idsRaw); }
  async debugSensor(sensorId: number) { return this.sensorDebugCoreService.debugSensor(sensorId); }
  async getSensorMetrics(sensorId: number, window = '1h') { return this.sensorMetricsService.getSensorMetrics(sensorId, window); }
  async getSensorDashboard(sensorId: number, range = '6h') { return this.sensorDashboardService.getSensorDashboard(sensorId, range); }
  async getDbDebug(sensorId?: string) { return this.sensorDebugDbService.getDbDebug(sensorId); }
  async deleteSensor(sensorId: number) { return this.sensorManagementService.deleteSensor(sensorId); }
  async debugTelemetryFlow(sensorId?: number) { return this.sensorDebugTelemetryService.debugTelemetryFlow(sensorId); }
  async debugChartData(sensorId: number, range: string) { return this.sensorDebugChartService.debugChartData(sensorId, range); }
  async runAlertMaintenance() { return this.alertMaintenanceService.runAlertMaintenance(); }
  async deleteAllSensorReadings(userId: string) { return this.devToolsService.deleteAllSensorReadings(userId); }
  async deleteSensorReadingsBySensor(sensorId: number, userId: string) { return this.devToolsService.deleteSensorReadingsBySensor(sensorId, userId); }
}
