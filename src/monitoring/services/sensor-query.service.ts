import { Injectable } from '@nestjs/common';
import { DeviceQueryService } from './device-query.service';
import { SensorReadingQueryService } from './sensor-reading-query.service';
import { AlertQueryService } from './alert-query.service';
import { PredictionQueryService } from './prediction-query.service';
import { SensorStatusBatchService } from './sensor-status-batch.service';
import { SensorStatusCoreService } from './sensor-status-core.service';
import { SensorManagementService } from './sensor-management.service';

@Injectable()
export class SensorQueryService {
  constructor(
    private readonly deviceQueryService: DeviceQueryService,
    private readonly sensorReadingQueryService: SensorReadingQueryService,
    private readonly alertQueryService: AlertQueryService,
    private readonly predictionQueryService: PredictionQueryService,
    private readonly sensorStatusBatchService: SensorStatusBatchService,
    private readonly sensorStatusCoreService: SensorStatusCoreService,
    private readonly sensorManagementService: SensorManagementService,
  ) {}

  async getDevicesWithSensors() { return this.deviceQueryService.getDevicesWithSensors(); }
  async getDeviceById(id: number) { return this.deviceQueryService.getDeviceById(id); }
  async getLatestSensorReadings() { return this.sensorReadingQueryService.getLatestSensorReadings(); }
  async getActiveAlerts(limit = 100) { return this.alertQueryService.getActiveAlerts(limit); }
  async getActiveMlEvents(limit = 50) { return this.alertQueryService.getActiveMlEvents(limit); }
  async getAllSensorsConsolidatedStatus() { return this.sensorStatusBatchService.getAllSensorsConsolidatedStatus(); }
  async getLatestPredictions(limit = 50) { return this.predictionQueryService.getLatestPredictions(limit); }
  async getSensorReadings(sensorId: number, limit = 100) { return this.sensorReadingQueryService.getSensorReadings(sensorId, limit); }
  async getSensorConsolidatedStatus(sensorId: number) { return this.sensorStatusCoreService.getSensorConsolidatedStatus(sensorId); }
  async getSensorConsolidatedStatusBatch(idsRaw: string) { return this.sensorStatusBatchService.getSensorConsolidatedStatusBatch(idsRaw); }
  async getSensorAlertsHistory(sensorId: number, limit = 50) { return this.alertQueryService.getSensorAlertsHistory(sensorId, limit); }
  async insertSensorReading(sensorId: number, value: number) { return this.sensorReadingQueryService.insertSensorReading(sensorId, value); }
  async getMlHealth() { return this.predictionQueryService.getMlHealth(); }
  async deleteSensor(sensorId: number) { return this.sensorManagementService.deleteSensor(sensorId); }
}
