import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { EventsModule } from '../events/events.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEventBus } from './realtime-event-bus.service';
import {
  SensorReadingSubscriber,
  AlertSubscriber,
  PredictionSubscriber,
  AlertEventSubscriber,
} from './subscribers';

@Module({
  imports: [AuthModule, MonitoringModule, EventsModule],
  providers: [
    RealtimeGateway,
    RealtimeEventBus,
    SensorReadingSubscriber,
    AlertSubscriber,
    PredictionSubscriber,
    AlertEventSubscriber,
  ],
  exports: [RealtimeGateway, RealtimeEventBus],
})
export class RealtimeModule {}
