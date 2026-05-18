import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';
import { IntelligencePredictionService } from './intelligence-prediction.service';
import { IntelligenceDecisionService } from './intelligence-decision.service';
import { MlPipelineService } from './ml-pipeline.service';
import { MlPipelineTrainingService } from './ml-pipeline-training.service';
import { MlPipelineInferenceService } from './ml-pipeline-inference.service';
import { MlPipelineDiagnosticsService } from './ml-pipeline-diagnostics.service';
import { Prediction } from '../entities/prediction.entity';
import { MlEvent } from '../entities/ml-event.entity';
import { MlEventActiveView } from '../entities/views';
import { Sensor } from '../entities/sensor.entity';
import { Device } from '../entities/device.entity';
import { DecisionAction } from '../entities/decision-action.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Prediction,
      MlEvent,
      MlEventActiveView,
      Sensor,
      Device,
      DecisionAction,
      AlertThreshold,
    ]),
  ],
  controllers: [IntelligenceController],
  providers: [IntelligenceService, IntelligencePredictionService, IntelligenceDecisionService, MlPipelineService, MlPipelineTrainingService, MlPipelineInferenceService, MlPipelineDiagnosticsService],
  exports: [IntelligenceService, MlPipelineService, MlPipelineTrainingService, MlPipelineInferenceService, MlPipelineDiagnosticsService],
})
export class IntelligenceModule {}
