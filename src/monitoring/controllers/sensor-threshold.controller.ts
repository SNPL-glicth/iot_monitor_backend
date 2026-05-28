import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SensorThresholdService } from '../services/sensor-threshold.service';
import {
  UpdateThresholdProfileDto,
  CreateSensorThresholdDto,
  UpdateThresholdDto,
} from '../dto/monitoring.dto';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('monitoring')
export class SensorThresholdController {
  constructor(private readonly sensorThresholdService: SensorThresholdService) {}

  @Get('sensors/:sensorId/thresholds')
  @Roles('admin', 'operator', 'viewer')
  getSensorThresholds(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.sensorThresholdService.getSensorThresholds(sensorId);
  }

  @Get('sensors/:sensorId/threshold-profile')
  @Roles('admin', 'operator', 'viewer')
  getSensorThresholdProfile(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.sensorThresholdService.getSensorThresholdProfile(sensorId);
  }

  @Patch('sensors/:sensorId/threshold-profile')
  @Roles('admin')
  updateSensorThresholdProfile(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Body() body: UpdateThresholdProfileDto,
  ) {
    return this.sensorThresholdService.upsertSensorThresholdProfile(sensorId, {
      warningMin: body.warningMin ?? null,
      warningMax: body.warningMax ?? null,
      alertMin: body.alertMin ?? null,
      alertMax: body.alertMax ?? null,
      cooldownSeconds: body.cooldownSeconds,
    });
  }

  @Post('sensors/:sensorId/thresholds')
  @Roles('admin')
  createSensorThreshold(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Body() body: CreateSensorThresholdDto,
  ) {
    return this.sensorThresholdService.createSensorThreshold(sensorId, {
      name: body.name,
      conditionType: body.conditionType,
      thresholdValueMin: body.thresholdValueMin ?? null,
      thresholdValueMax: body.thresholdValueMax ?? null,
      severity: body.severity,
    });
  }

  @Patch('thresholds/:thresholdId')
  @Roles('admin')
  updateThreshold(
    @Param('thresholdId', ParseIntPipe) thresholdId: number,
    @Body() body: UpdateThresholdDto,
    @Req() req: any,
  ) {
    const userId = String(req?.user?.userId ?? '');
    return this.sensorThresholdService.updateThreshold(thresholdId, userId, {
      thresholdValueMin: body.thresholdValueMin,
      thresholdValueMax: body.thresholdValueMax,
      severity: body.severity,
      name: body.name,
      reason: body.reason ?? null,
    });
  }

  @Delete('thresholds/:thresholdId')
  @Roles('admin')
  deactivateThreshold(
    @Param('thresholdId', ParseIntPipe) thresholdId: number,
    @Query('reason') reason: string | undefined,
    @Req() req: any,
  ) {
    const userId = String(req?.user?.userId ?? '');
    return this.sensorThresholdService.deactivateThreshold(thresholdId, userId, reason ?? null);
  }

  @Get('thresholds/:thresholdId/history')
  @Roles('admin', 'operator', 'viewer')
  getThresholdHistory(@Param('thresholdId', ParseIntPipe) thresholdId: number) {
    return this.sensorThresholdService.getThresholdHistory(thresholdId);
  }
}
