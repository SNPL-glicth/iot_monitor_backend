import { Controller, Get, Param, ParseIntPipe, Query, UseGuards, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RateLimitGuard, BatchRateLimit } from '../common/rate-limit.guard';
import { MonitoringService } from './monitoring.service';

// Alias controller para exponer /sensors/:sensorId/status sin forzar al frontend
// a depender del prefijo /monitoring.
@UseGuards(AuthGuard('jwt'), RolesGuard, RateLimitGuard)
@Controller('sensors')
export class SensorStatusController {
  private readonly logger = new Logger(SensorStatusController.name);

  constructor(private readonly monitoringService: MonitoringService) {}

  // Perf 2.1: Endpoint batch para eliminar N+1 queries en Flutter
  // FASE 4: Rate limit más restrictivo para batch (30 req/min)
  @Get('status/batch')
  @Roles('admin', 'operator', 'viewer')
  @BatchRateLimit()
  async getSensorStatusBatch(@Query('ids') idsRaw: string) {
    return this.monitoringService.getSensorConsolidatedStatusBatch(idsRaw);
  }

  @Get(':sensorId/status')
  @Roles('admin', 'operator', 'viewer')
  getSensorStatus(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.monitoringService.getSensorConsolidatedStatus(sensorId);
  }

  @Get(':sensorId/metrics')
  @Roles('admin', 'operator', 'viewer') 
  getSensorMetrics(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('window') window = '1h',
  ) {
    return this.monitoringService.getSensorMetrics(sensorId, window);
  }

  @Get(':sensorId/thresholds-canonical')
  @Roles('admin', 'operator', 'viewer')
  getSensorThresholdsCanonical(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.monitoringService.getSensorThresholdsCanonical(sensorId);
  }

  /**
   * @deprecated FASE 1 CORRECCIÓN ARQUITECTÓNICA
   * 
   * Este endpoint está DEPRECADO y será eliminado en una versión futura.
   * 
   * VIOLACIÓN DE CONTRATO:
   * - Backend NestJS NO debe alimentar gráficas de sensores
   * - Telemetría (:8099) es la FUENTE CANÓNICA para visualización
   * 
   * MIGRACIÓN REQUERIDA:
   * - Flutter debe consumir: GET /telemetry/sensors/:id/trading
   * - Flutter debe consumir: GET /telemetry/sensors/:id/metrics
   * 
   * Este endpoint se mantiene temporalmente para:
   * - Evitar regresiones durante la transición
   * - Permitir migración gradual de clientes
   * 
   * FECHA DE DEPRECACIÓN: 2024-01
   * FECHA DE ELIMINACIÓN ESTIMADA: 2024-03
   */
  @Get(':sensorId/dashboard')
  @Roles('admin', 'operator', 'viewer')
  getSensorDashboard(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('range') range = '6h',
  ) {
    // WARNING: Endpoint deprecado - registrar uso para monitoreo de migración
    this.logger.warn(
      `[DEPRECATED] GET /sensors/${sensorId}/dashboard llamado. ` +
      `Migrar a Telemetría: GET /telemetry/sensors/${sensorId}/trading`,
    );
    return this.monitoringService.getSensorDashboard(sensorId, range);
  }
}
