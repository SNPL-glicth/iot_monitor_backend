import { Injectable } from '@nestjs/common';
import { MlPipelineService } from './ml-pipeline.service';

@Injectable()
export class MlPipelineDiagnosticsService {
  constructor(private readonly pipeline: MlPipelineService) {}

  async diagnosePipeline() { return this.pipeline.diagnosePipeline(); }
  async getModelStats() { return this.pipeline.getModelStats(); }
  async getModelDiagnostic() { return this.pipeline.getModelDiagnostic(); }
}
