import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { MonitoringController } from './controllers/monitoring.controller';
import { SensorReadingController } from './controllers/sensor-reading.controller';
import { SensorThresholdController } from './controllers/sensor-threshold.controller';
import { SensorAlertController } from './controllers/sensor-alert.controller';
import { SensorDebugController } from './controllers/sensor-debug.controller';
import { SensorDevToolsController } from './controllers/sensor-dev-tools.controller';
import { SensorStatusController } from './controllers/sensor-status.controller';
import { MonitoringService } from './services/monitoring.service';
import { SensorMetricsService } from './services/sensor-metrics.service';
import { AlertMaintenanceService } from './services/alert-maintenance.service';
import { DevToolsService } from './services/dev-tools.service';
import { SensorThresholdService } from './services/sensor-threshold.service';
import { SensorQueryService } from './services/sensor-query.service';
import { SensorDiagnosticService } from './services/sensor-diagnostic.service';
import { SensorDashboardService } from './services/sensor-dashboard.service';
import { SensorStatusCoreService } from './services/sensor-status-core.service';
import { SensorStatusBatchService } from './services/sensor-status-batch.service';
import { SensorDebugCoreService } from './services/sensor-debug-core.service';
import { SensorDebugTelemetryService } from './services/sensor-debug-telemetry.service';
import { SensorDebugChartService } from './services/sensor-debug-chart.service';
import { SensorDebugDbService } from './services/sensor-debug-db.service';
import { SensorManagementService } from './services/sensor-management.service';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { Device } from '../entities/device.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Sensor } from '../entities/sensor.entity';
import { SensorReading } from '../entities/sensor-reading.entity';
import { Alert } from '../entities/alert.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';
import { SensorThresholdProfile } from '../entities/sensor-threshold-profile.entity';
import { ThresholdHistory } from '../entities/threshold-history.entity';
import { Prediction } from '../entities/prediction.entity';
import {
  DeviceWithSensorsView,
  ActiveAlertView,
  AlertsHistoryView,
  LatestSensorReadingView,
  MlEventActiveView,
  SensorConsolidatedStatusView,
} from '../entities/views';
import { StateComputationService } from '../domain/state-computation.service';
import { ThresholdValidator } from './threshold/threshold-validator';
import { ThresholdService } from './threshold/threshold.service';
import { DeviceQueryService } from './services/device-query.service';
import { SensorReadingQueryService } from './services/sensor-reading-query.service';
import { AlertQueryService } from './services/alert-query.service';
import { PredictionQueryService } from './services/prediction-query.service';

@Module({
  imports: [
    HttpModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Device,
      Sensor,
      SensorReading,
      Alert,
      AlertThreshold,
      SensorThresholdProfile,
      ThresholdHistory,
      Prediction,
      DeviceWithSensorsView,
      ActiveAlertView,
      AlertsHistoryView,
      LatestSensorReadingView,
      MlEventActiveView,
      SensorConsolidatedStatusView,
    ]),
  ],
  controllers: [
    MonitoringController,
    SensorReadingController,
    SensorThresholdController,
    SensorAlertController,
    SensorDebugController,
    SensorDevToolsController,
    SensorStatusController,
  ],
  providers: [
    MonitoringService,
    SensorMetricsService,
    AlertMaintenanceService,
    DevToolsService,
    SensorThresholdService,
    SensorQueryService,
    SensorDiagnosticService,
    SensorDashboardService,
    SensorStatusCoreService,
    SensorStatusBatchService,
    SensorDebugCoreService,
    SensorDebugTelemetryService,
    SensorDebugChartService,
    SensorDebugDbService,
    SensorManagementService,
    RateLimitGuard,
    StateComputationService,
    ThresholdValidator,
    ThresholdService,
    DeviceQueryService,
    SensorReadingQueryService,
    AlertQueryService,
    PredictionQueryService,
  ],
  exports: [
    MonitoringService,
    StateComputationService,
    SensorMetricsService,
    SensorThresholdService,
    SensorQueryService,
    SensorDiagnosticService,
    SensorDashboardService,
    SensorStatusCoreService,
    SensorStatusBatchService,
    SensorDebugCoreService,
    SensorDebugTelemetryService,
    SensorDebugChartService,
    SensorDebugDbService,
    SensorManagementService,
    DeviceQueryService,
    SensorReadingQueryService,
    AlertQueryService,
    PredictionQueryService,
  ],
})
export class MonitoringModule {}
