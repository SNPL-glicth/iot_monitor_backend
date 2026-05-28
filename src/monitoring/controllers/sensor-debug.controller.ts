import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SensorDiagnosticService } from '../services/sensor-diagnostic.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('monitoring')
export class SensorDebugController {
  constructor(private readonly sensorDiagnosticService: SensorDiagnosticService) {}

  @Get('debug/db')
  @Roles('admin', 'operator', 'viewer')
  getDbDebug(@Query('sensorId') sensorId?: string) {
    return this.sensorDiagnosticService.getDbDebug(sensorId);
  }

  @Get('debug/sensors/:sensorId')
  @Roles('admin')
  async debugSensor(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.sensorDiagnosticService.debugSensor(sensorId);
  }

  @Get('debug/telemetry-flow')
  @Roles('admin', 'operator', 'viewer')
  async debugTelemetryFlow(@Query('sensorId') sensorId?: string) {
    return this.sensorDiagnosticService.debugTelemetryFlow(sensorId ? Number(sensorId) : undefined);
  }

  @Get('debug/chart-data')
  @Roles('admin', 'operator', 'viewer')
  async debugChartData(
    @Query('sensorId', ParseIntPipe) sensorId: number,
    @Query('range') range = '1h',
  ) {
    return this.sensorDiagnosticService.debugChartData(sensorId, range);
  }
}
