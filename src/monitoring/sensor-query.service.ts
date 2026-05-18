import { Injectable } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class SensorQueryService {
  constructor(private readonly monitoring: MonitoringService) {}

  async getDevicesWithSensors() { return this.monitoring.getDevicesWithSensors(); }
  async getDeviceById(id: number) { return this.monitoring.getDeviceById(id); }
  async getLatestSensorReadings() { return this.monitoring.getLatestSensorReadings(); }
  async getActiveAlerts(limit = 100) { return this.monitoring.getActiveAlerts(limit); }
  async getActiveMlEvents(limit = 50) { return this.monitoring.getActiveMlEvents(limit); }
  async getAllSensorsConsolidatedStatus() { return this.monitoring.getAllSensorsConsolidatedStatus(); }
  async getLatestPredictions(limit = 50) { return this.monitoring.getLatestPredictions(limit); }
  async getSensorReadings(sensorId: number, limit = 100) { return this.monitoring.getSensorReadings(sensorId, limit); }
  async getSensorConsolidatedStatus(sensorId: number) { return this.monitoring.getSensorConsolidatedStatus(sensorId); }
  async getSensorConsolidatedStatusBatch(idsRaw: string) { return this.monitoring.getSensorConsolidatedStatusBatch(idsRaw); }
  async getSensorAlertsHistory(sensorId: number, limit = 50) { return this.monitoring.getSensorAlertsHistory(sensorId, limit); }
  async insertSensorReading(sensorId: number, value: number) { return this.monitoring.insertSensorReading(sensorId, value); }
  async getMlHealth() { return this.monitoring.getMlHealth(); }
  async deleteSensor(sensorId: number) { return this.monitoring.deleteSensor(sensorId); }
}
