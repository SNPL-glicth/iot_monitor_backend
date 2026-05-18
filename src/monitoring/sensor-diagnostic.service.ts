import { Injectable } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';

@Injectable()
export class SensorDiagnosticService {
  constructor(private readonly monitoring: MonitoringService) {}

  async debugSensor(sensorId: number) { return this.monitoring.debugSensor(sensorId); }
  async getDbDebug(sensorId?: string) { return this.monitoring.getDbDebug(sensorId); }
  async debugTelemetryFlow(sensorId?: number) { return this.monitoring.debugTelemetryFlow(sensorId); }
  async debugChartData(sensorId: number, range: string) { return this.monitoring.debugChartData(sensorId, range); }
  async getSensorDashboard(sensorId: number, range = '6h') { return this.monitoring.getSensorDashboard(sensorId, range); }
}
