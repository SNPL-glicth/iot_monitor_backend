import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Device } from './entities/device.entity';
import { Sensor } from './entities/sensor.entity';
import { SensorReading } from './entities/sensor-reading.entity';
import { Alert } from './entities/alert.entity';
import { AlertThreshold } from './entities/alert-threshold.entity';
import { SensorThresholdProfile } from './entities/sensor-threshold-profile.entity';
import { User } from './entities/user.entity';
import { UserDevice } from './entities/user-device.entity';
import { DeviceLocation } from './entities/device-location.entity';
import { Command } from './entities/command.entity';
import { MlModel } from './entities/ml-model.entity';
import { Prediction } from './entities/prediction.entity';
import { AuditLog } from './entities/audit-log.entity';
import { SystemMetric } from './entities/system-metric.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AlertNotification } from './entities/alert-notification.entity';
import {
  ActiveAlertView,
  AlertsHistoryView,
  DeviceProfileSummaryView,
  DeviceTimelineView,
  DeviceWithSensorsView,
  LatestSensorReadingView,
  MlEventActiveView,
} from './entities/views';
import { MonitoringModule } from './monitoring/monitoring.module';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { CrmModule } from './crm/crm.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntelligenceModule } from './intelligence/intelligence.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mssql',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 1434,
      username: process.env.DB_USER || 'sa',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'iot_monitoring_system',
      options: {
        encrypt: false,
        enableArithAbort: true,
      },
      extra: {
        trustServerCertificate: true,
      },
      entities: [
        Device,
        Sensor,
        SensorReading,
        Alert,
        AlertThreshold,
        SensorThresholdProfile,
        User,
        UserDevice,
        DeviceLocation,
        Command,
        MlModel,
        Prediction,
        AuditLog,
        SystemMetric,
        RefreshToken,
        AlertNotification,
        DeviceWithSensorsView,
        ActiveAlertView,
        LatestSensorReadingView,
        MlEventActiveView,
        AlertsHistoryView,
        DeviceProfileSummaryView,
        DeviceTimelineView,
      ],
      synchronize: false,
    }),
    MonitoringModule,
    AdminUsersModule,
    AuthModule,
    RealtimeModule,
    CrmModule,
    NotificationsModule,
    IntelligenceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
