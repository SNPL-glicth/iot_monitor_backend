import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { EventsModule } from '../events/events.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePollerService } from './realtime.poller';

@Module({
  imports: [AuthModule, MonitoringModule, EventsModule],
  providers: [RealtimeGateway, RealtimePollerService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
