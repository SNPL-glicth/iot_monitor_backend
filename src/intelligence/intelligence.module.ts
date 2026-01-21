import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';
import { Prediction } from '../entities/prediction.entity';
import { MlEventActiveView } from '../entities/views';
import { Sensor } from '../entities/sensor.entity';
import { Device } from '../entities/device.entity';
import { DecisionAction } from '../entities/decision-action.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Prediction, MlEventActiveView, Sensor, Device, DecisionAction]),
  ],
  controllers: [IntelligenceController],
  providers: [IntelligenceService],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
