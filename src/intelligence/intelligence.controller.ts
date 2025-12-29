import { Controller, Get, Query } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceHealthDto, IntelligencePredictionDto, IntelligenceWarningDto } from './intelligence.dto';

@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Get('predictions')
  async getPredictions(@Query('limit') limit?: string): Promise<IntelligencePredictionDto[]> {
    const n = limit ? Number(limit) : 50;
    return this.intelligenceService.listPredictions(Number.isFinite(n) && n > 0 ? n : 50);
  }

  @Get('warnings')
  async getWarnings(@Query('limit') limit?: string): Promise<IntelligenceWarningDto[]> {
    const n = limit ? Number(limit) : 50;
    return this.intelligenceService.listWarnings(Number.isFinite(n) && n > 0 ? n : 50);
  }

  @Get('health')
  async getHealth(): Promise<IntelligenceHealthDto> {
    return this.intelligenceService.getHealth();
  }
}
