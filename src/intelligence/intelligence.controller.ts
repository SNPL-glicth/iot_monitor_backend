import { Controller, Get, Post, Patch, Param, Query, Body, NotFoundException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IntelligenceService } from './intelligence.service';
import { MlPipelineService } from './ml-pipeline.service';
import { IntelligenceHealthDto, IntelligencePredictionDto, IntelligenceWarningDto } from './intelligence.dto';
import { DecisionActionDto, DecisionActionListResponseDto, UpdateDecisionStatusDto } from './decision-action.dto';

@Controller('intelligence')
@UseGuards(AuthGuard('jwt'))
export class IntelligenceController {
  constructor(
    private readonly intelligenceService: IntelligenceService,
    private readonly mlPipelineService: MlPipelineService,
  ) {}

  @Get('predictions')
  async getPredictions(@Query('limit') limit?: string): Promise<IntelligencePredictionDto[]> {
    const n = limit ? Number(limit) : 50;
    return this.intelligenceService.listPredictions(Number.isFinite(n) && n > 0 ? n : 50);
  }

  @Get('warnings')
  async getWarnings(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ): Promise<IntelligenceWarningDto[]> {
    const n = limit ? Number(limit) : 50;
    return this.intelligenceService.listWarnings(
      Number.isFinite(n) && n > 0 ? n : 50,
      status,
    );
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

  // ===========================================================================
  // ML PIPELINE ENDPOINTS
  // ===========================================================================

  /**
   * GET /intelligence/pipeline/diagnose
   * 
   * Diagnóstico completo del pipeline ML.
   * Identifica exactamente dónde se rompe la conversión prediction → ml_event.
   */
  @Get('pipeline/diagnose')
  async diagnosePipeline() {
    return this.mlPipelineService.diagnosePipeline();
  }

  /**
   * POST /intelligence/pipeline/convert
   * 
   * Convierte predicciones pendientes a eventos ML.
   * Opciones:
   * - limit: número máximo de predicciones a procesar (default: 100)
   * - onlyAnomalies: solo procesar anomalías (default: false)
   * - onlyHighRisk: solo procesar alto riesgo (default: false)
   * - dryRun: simular sin crear eventos (default: false)
   */
  @Post('pipeline/convert')
  async convertPredictions(
    @Query('limit') limit?: string,
    @Query('onlyAnomalies') onlyAnomalies?: string,
    @Query('onlyHighRisk') onlyHighRisk?: string,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.mlPipelineService.convertPredictionsToEvents({
      limit: limit ? Number(limit) : 100,
      onlyAnomalies: onlyAnomalies === 'true',
      onlyHighRisk: onlyHighRisk === 'true',
      dryRun: dryRun === 'true',
    });
  }

  /**
   * GET /intelligence/pipeline/stats
   * 
   * Estadísticas del modelo ML.
   */
  @Get('pipeline/stats')
  async getModelStats() {
    return this.mlPipelineService.getModelStats();
  }

  // NOTA: El endpoint /intelligence/ml/diagnostic fue movido al servidor de telemetría
  // Usar: GET http://localhost:8003/diagnostics/ml/model-status
  // Esto evita sobrecargar el backend NestJS con consultas pesadas de diagnóstico ML
}
