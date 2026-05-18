import { Injectable } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { IntelligencePredictionDto, IntelligenceWarningDto } from './intelligence.dto';

@Injectable()
export class IntelligencePredictionService {
  constructor(private readonly intelligence: IntelligenceService) {}

  async listPredictions(limit = 50): Promise<IntelligencePredictionDto[]> {
    return this.intelligence.listPredictions(limit);
  }

  async listWarnings(limit = 50, status?: string): Promise<IntelligenceWarningDto[]> {
    return this.intelligence.listWarnings(limit, status);
  }
}
