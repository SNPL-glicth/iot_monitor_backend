import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SensorQueryService } from '../services/sensor-query.service';
import { AlertMaintenanceService } from '../services/alert-maintenance.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('monitoring')
export class SensorAlertController {
  constructor(
    private readonly sensorQueryService: SensorQueryService,
    private readonly alertMaintenanceService: AlertMaintenanceService,
  ) {}

  @Get('alerts/active')
  @Roles('admin', 'operator', 'viewer')
  getActiveAlerts(@Query('limit') limit = '100') {
    const parsedLimit = Number(limit) || 100;
    return this.sensorQueryService.getActiveAlerts(parsedLimit);
  }

  @Get('sensors/:sensorId/alerts')
  @Roles('admin', 'operator', 'viewer')
  getSensorAlertsHistory(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('limit') limit = '50',
  ) {
    const parsedLimit = Number(limit) || 50;
    return this.sensorQueryService.getSensorAlertsHistory(sensorId, parsedLimit);
  }

  @Get('ml-events/active')
  @Roles('admin', 'operator', 'viewer')
  getActiveMlEvents(@Query('limit') limit = '50') {
    const parsedLimit = Number(limit) || 50;
    return this.sensorQueryService.getActiveMlEvents(parsedLimit);
  }

  @Post('run-alert-maintenance')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async runAlertMaintenance() {
    return this.alertMaintenanceService.runAlertMaintenance();
  }
}
