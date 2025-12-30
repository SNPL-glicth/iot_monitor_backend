import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MonitoringService } from './monitoring.service';

// Endpoints de monitoreo (principalmente lectura)
// Protegidos con JWT. Roles permitidos: admin/operator/viewer.
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  /**
    obtiene de 
    get /monitoring/devices
    Lista dispositivos con información de sensores --- vista v_devices_with_sensors
   */
  @Get('devices')
  @Roles('admin', 'operator', 'viewer')
  getDevicesWithSensors() {
    return this.monitoringService.getDevicesWithSensors();
  }

  /**
    get /monitoring/devices/:id
    aqui devuelve información básica del dispositivo por ID.
   */
  @Get('devices/:id')
  @Roles('admin', 'operator', 'viewer')
  getDeviceById(@Param('id', ParseIntPipe) id: number) {
    return this.monitoringService.getDeviceById(id);
  }

  /**
     get /monitoring/readings/latest
     ultimas lecturas por sensor (vista v_latest_sensor_readings)
   */
  @Get('readings/latest')
  @Roles('admin', 'operator', 'viewer')
  getLatestSensorReadings() {
    return this.monitoringService.getLatestSensorReadings();
  }

  /**
   * GET /monitoring/alerts/active?limit=100
   */
  @Get('alerts/active')
  @Roles('admin', 'operator', 'viewer')
  getActiveAlerts(@Query('limit') limit = '100') {
    const parsedLimit = Number(limit) || 100;
    return this.monitoringService.getActiveAlerts(parsedLimit);
  }

  /**
   * GET /monitoring/sensors/:sensorId/readings?limit=100
   * Historial de lecturas para un sensor.
   */
  @Get('sensors/:sensorId/readings')
  @Roles('admin', 'operator', 'viewer')
  getSensorReadings(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('limit') limit = '100',
  ) {
    const parsedLimit = Number(limit) || 100;
    return this.monitoringService.getSensorReadings(sensorId, parsedLimit);
  }

  @Get('sensors/:sensorId/status')
  @Roles('admin', 'operator', 'viewer')
  getSensorConsolidatedStatus(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.monitoringService.getSensorConsolidatedStatus(sensorId);
  }

  /**
   * GET /monitoring/sensors/:sensorId/alerts?limit=50
   * Historial de alertas del sensor.
   */
  @Get('sensors/:sensorId/alerts')
  @Roles('admin', 'operator', 'viewer')
  getSensorAlertsHistory(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('limit') limit = '50',
  ) {
    const parsedLimit = Number(limit) || 50;
    return this.monitoringService.getSensorAlertsHistory(sensorId, parsedLimit);
  }

  /**
   * GET /monitoring/sensors/:sensorId/thresholds
   * Devuelve los umbrales configurados para el sensor.
   */
  @Get('sensors/:sensorId/thresholds')
  @Roles('admin', 'operator', 'viewer')
  getSensorThresholds(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.monitoringService.getSensorThresholds(sensorId);
  }

  /**
   * POST /monitoring/sensors/:sensorId/thresholds
   * Crea un umbral para un sensor.
   */
  @Post('sensors/:sensorId/thresholds')
  @Roles('admin')
  createSensorThreshold(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Body() body: any,
  ) {
    return this.monitoringService.createSensorThreshold(sensorId, {
      name: body?.name,
      conditionType: body?.conditionType,
      thresholdValueMin: body?.thresholdValueMin ?? null,
      thresholdValueMax: body?.thresholdValueMax ?? null,
      severity: body?.severity,
    });
  }

  /**
   * PATCH /monitoring/thresholds/:thresholdId
   * Actualiza un umbral y registra historial (threshold_history).
   */
  @Patch('thresholds/:thresholdId')
  @Roles('admin')
  updateThreshold(
    @Param('thresholdId', ParseIntPipe) thresholdId: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    const userId = String(req?.user?.userId ?? '');
    return this.monitoringService.updateThreshold(thresholdId, userId, {
      thresholdValueMin: body?.thresholdValueMin,
      thresholdValueMax: body?.thresholdValueMax,
      severity: body?.severity,
      name: body?.name,
      reason: body?.reason ?? null,
    });
  }

  /**
   * DELETE /monitoring/thresholds/:thresholdId
   * Desactiva un umbral (is_active=false) y deja trazabilidad en historial.
   */
  @Delete('thresholds/:thresholdId')
  @Roles('admin')
  deactivateThreshold(
    @Param('thresholdId', ParseIntPipe) thresholdId: number,
    @Query('reason') reason: string | undefined,
    @Req() req: any,
  ) {
    const userId = String(req?.user?.userId ?? '');
    return this.monitoringService.deactivateThreshold(thresholdId, userId, reason ?? null);
  }

  /**
   * GET /monitoring/thresholds/:thresholdId/history
   * Historial de cambios del umbral.
   */
  @Get('thresholds/:thresholdId/history')
  @Roles('admin', 'operator', 'viewer')
  getThresholdHistory(@Param('thresholdId', ParseIntPipe) thresholdId: number) {
    return this.monitoringService.getThresholdHistory(thresholdId);
  }


  /**
   * GET /monitoring/predictions?limit=50
   * Predicciones generadas por modelos de ML.
   */
  @Get('predictions')
  @Roles('admin', 'operator', 'viewer')
  getLatestPredictions(@Query('limit') limit = '50') {
    const parsedLimit = Number(limit) || 50;
    return this.monitoringService.getLatestPredictions(parsedLimit);
  }

  /**
   * GET /monitoring/ml-events/active?limit=50
   * Eventos/avisos de ML activos o reconocidos.
   */
  @Get('ml-events/active')
  @Roles('admin', 'operator', 'viewer')
  getActiveMlEvents(@Query('limit') limit = '50') {
    const parsedLimit = Number(limit) || 50;
    return this.monitoringService.getActiveMlEvents(parsedLimit);
  }

  /**
   * POST /monitoring/sensors/:sensorId/readings
   * Body: { value: number }
   * Inserta una lectura y evalúa umbrales vía SP sp_insert_reading_and_check_threshold.
   */
  @Post('sensors/:sensorId/readings')
  @Roles('admin')
  async insertReading(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Body('value') value: number,
  ) {
    await this.monitoringService.insertSensorReading(sensorId, Number(value));
    return { success: true };
  }
}
