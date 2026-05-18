import { Injectable } from '@nestjs/common';
import { MlPipelineService } from './ml-pipeline.service';

@Injectable()
export class MlPipelineTrainingService {
  constructor(private readonly pipeline: MlPipelineService) {}

  async convertPredictionsToEvents(options?: any) { return this.pipeline.convertPredictionsToEvents(options); }
}
