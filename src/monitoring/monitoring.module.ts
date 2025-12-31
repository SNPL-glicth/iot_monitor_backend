import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { SensorStatusController } from './sensor-status.controller';
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
} from '../entities/views';

@Module({
  imports: [
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
    ]),
  ],
  controllers: [MonitoringController, SensorStatusController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
