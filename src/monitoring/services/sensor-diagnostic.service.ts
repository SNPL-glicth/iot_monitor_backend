import { Injectable } from '@nestjs/common';
import { SensorDebugCoreService } from './sensor-debug-core.service';
import { SensorDebugDbService } from './sensor-debug-db.service';
import { SensorDebugTelemetryService } from './sensor-debug-telemetry.service';
import { SensorDebugChartService } from './sensor-debug-chart.service';
import { SensorDashboardService } from './sensor-dashboard.service';

@Injectable()
export class SensorDiagnosticService {
  constructor(
    private readonly sensorDebugCoreService: SensorDebugCoreService,
    private readonly sensorDebugDbService: SensorDebugDbService,
    private readonly sensorDebugTelemetryService: SensorDebugTelemetryService,
    private readonly sensorDebugChartService: SensorDebugChartService,
    private readonly sensorDashboardService: SensorDashboardService,
  ) {}

  async debugSensor(sensorId: number) { return this.sensorDebugCoreService.debugSensor(sensorId); }
  async getDbDebug(sensorId?: string) { return this.sensorDebugDbService.getDbDebug(sensorId); }
  async debugTelemetryFlow(sensorId?: number) { return this.sensorDebugTelemetryService.debugTelemetryFlow(sensorId); }
  async debugChartData(sensorId: number, range: string) { return this.sensorDebugChartService.debugChartData(sensorId, range); }
  async getSensorDashboard(sensorId: number, range = '6h') { return this.sensorDashboardService.getSensorDashboard(sensorId, range); }
}
