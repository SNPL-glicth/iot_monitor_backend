import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePollerService } from './realtime.poller';

@Module({
  imports: [AuthModule, MonitoringModule],
  providers: [RealtimeGateway, RealtimePollerService],
})
export class RealtimeModule {}
