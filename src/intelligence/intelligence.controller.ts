import { Controller, Get, Patch, Param, Query, Body, NotFoundException } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceHealthDto, IntelligencePredictionDto, IntelligenceWarningDto } from './intelligence.dto';
import { DecisionActionDto, DecisionActionListResponseDto, UpdateDecisionStatusDto } from './decision-action.dto';

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

  // ---------------------------------------------------------------------------
  // GET /intelligence/decisions
  // ---------------------------------------------------------------------------
  @Get('decisions')
  async getDecisions(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ): Promise<DecisionActionListResponseDto> {
    const n = limit ? Number(limit) : 50;
    return this.intelligenceService.listDecisions(
      Number.isFinite(n) && n > 0 ? n : 50,
      status,
      severity,
    );
  }

  // ---------------------------------------------------------------------------
  // PATCH /intelligence/decisions/:id/status
  // ---------------------------------------------------------------------------
  @Patch('decisions/:id/status')
  async updateDecisionStatus(
    @Param('id') id: string,
    @Body() body: UpdateDecisionStatusDto,
  ): Promise<DecisionActionDto> {
    const result = await this.intelligenceService.updateDecisionStatus(id, body.status);
    if (!result) {
      throw new NotFoundException(`Decision ${id} not found`);
    }
    return result;
  }
}
