import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { DevToolsService } from '../services/dev-tools.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('monitoring')
export class SensorDevToolsController {
  constructor(private readonly devToolsService: DevToolsService) {}

  @Delete('dev-tools/sensor-readings/all')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deleteAllSensorReadings(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub || 'unknown';
    return this.devToolsService.deleteAllSensorReadings(userId);
  }

  @Delete('dev-tools/sensor-readings/sensor/:sensorId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deleteSensorReadingsBySensor(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub || 'unknown';
    return this.devToolsService.deleteSensorReadingsBySensor(sensorId, userId);
  }
}
