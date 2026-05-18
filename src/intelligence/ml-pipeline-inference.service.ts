import { Injectable } from '@nestjs/common';
import { MlPipelineService } from './ml-pipeline.service';

@Injectable()
export class MlPipelineInferenceService {
  constructor(private readonly pipeline: MlPipelineService) {}

  async convertPredictionsToEvents(options?: any) { return this.pipeline.convertPredictionsToEvents(options); }
}
