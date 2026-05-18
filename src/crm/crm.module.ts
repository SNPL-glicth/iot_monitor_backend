import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../entities/device.entity';
import { Sensor } from '../entities/sensor.entity';
import { SensorReading } from '../entities/sensor-reading.entity';
import { Alert } from '../entities/alert.entity';
import { DeviceLocation } from '../entities/device-location.entity';
import {
  ActiveAlertView,
  AlertsHistoryView,
  DeviceProfileSummaryView,
  DeviceTimelineView,
  LatestSensorReadingView,
  MlEventActiveView,
} from '../entities/views';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmDashboardService } from './crm-dashboard.service';
import { CrmAlertService } from './crm-alert.service';
import { CrmDeviceService } from './crm-device.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Device,
      Sensor,
      SensorReading,
      Alert,
      DeviceLocation,
      LatestSensorReadingView,
      ActiveAlertView,
      AlertsHistoryView,
      DeviceProfileSummaryView,
      DeviceTimelineView,
      MlEventActiveView,
    ]),
  ],
  controllers: [CrmController],
  providers: [CrmService, CrmDashboardService, CrmAlertService, CrmDeviceService],
  exports: [CrmService],
})
export class CrmModule {}
