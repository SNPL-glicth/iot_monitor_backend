import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SensorQueryService } from '../services/sensor-query.service';
import { SensorMetricsService } from '../services/sensor-metrics.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('monitoring')
export class SensorReadingController {
  constructor(
    private readonly sensorQueryService: SensorQueryService,
    private readonly sensorMetricsService: SensorMetricsService,
  ) {}

  @Get('readings/latest')
  @Roles('admin', 'operator', 'viewer')
  getLatestSensorReadings() {
    return this.sensorQueryService.getLatestSensorReadings();
  }

  @Get('sensors/:sensorId/readings')
  @Roles('admin', 'operator', 'viewer')
  getSensorReadings(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('limit') limit = '100',
  ) {
    const parsedLimit = Number(limit) || 100;
    return this.sensorQueryService.getSensorReadings(sensorId, parsedLimit);
  }

  @Post('sensors/:sensorId/readings')
  @Roles('admin')
  async insertReading(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Body('value') value: number,
  ) {
    await this.sensorQueryService.insertSensorReading(sensorId, Number(value));
    return { success: true };
  }

  @Get('sensors/:sensorId/raw-readings')
  @Roles('admin', 'operator', 'viewer')
  getRawSensorReadings(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('limit') limit = '500',
    @Query('since') since?: string,
  ) {
    const parsedLimit = Math.min(Math.max(1, Number(limit) || 500), 2000);
    return this.sensorMetricsService.getRawSensorReadings(sensorId, parsedLimit, since);
  }

  @Get('sensors/:sensorId/aggregated')
  @Roles('admin', 'operator', 'viewer')
  getAggregatedSensorReadings(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('range') range = '6h',
  ) {
    return this.sensorMetricsService.getAggregatedSensorReadings(sensorId, range);
  }

  @Get('sensors/:sensorId/historical-readings')
  @Roles('admin', 'operator', 'viewer')
  getHistoricalReadings(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit = '500',
  ) {
    const parsedLimit = Math.min(Math.max(1, Number(limit) || 500), 2000);
    return this.sensorMetricsService.getHistoricalReadings(sensorId, from, to, parsedLimit);
  }
}
