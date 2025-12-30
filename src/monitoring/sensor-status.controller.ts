import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MonitoringService } from './monitoring.service';

// Alias controller para exponer /sensors/:sensorId/status sin forzar al frontend
// a depender del prefijo /monitoring.
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sensors')
export class SensorStatusController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get(':sensorId/status')
  @Roles('admin', 'operator', 'viewer')
  getSensorStatus(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.monitoringService.getSensorConsolidatedStatus(sensorId);
  }
}
