import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
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

  @Get(':sensorId/dashboard')
  @Roles('admin', 'operator', 'viewer')
  getSensorDashboard(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('range') range = '6h',
  ) {
    return this.monitoringService.getSensorDashboard(sensorId, range);
  }
}
