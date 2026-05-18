import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { SensorMetricsService } from './sensor-metrics.service';
import { AlertMaintenanceService } from './alert-maintenance.service';
import { DevToolsService } from './dev-tools.service';
import { SensorStatusController } from './sensor-status.controller';
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
  controllers: [MonitoringController, SensorStatusController],
  providers: [
    MonitoringService,
    SensorMetricsService,
    AlertMaintenanceService,
    DevToolsService,
    RateLimitGuard,
    StateComputationService,
  ],
  exports: [MonitoringService, StateComputationService, SensorMetricsService],
})
export class MonitoringModule {}
