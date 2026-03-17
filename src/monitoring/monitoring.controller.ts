import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
   * GET /monitoring/sensors/:sensorId/threshold-profile
   * Perfil explícito WARNING/ALERT + cooldown.
   */
  @Get('sensors/:sensorId/threshold-profile')
  @Roles('admin', 'operator', 'viewer')
  getSensorThresholdProfile(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.monitoringService.getSensorThresholdProfile(sensorId);
  }

  /**
   * PATCH /monitoring/sensors/:sensorId/threshold-profile
   */
  @Patch('sensors/:sensorId/threshold-profile')
  @Roles('admin')
  updateSensorThresholdProfile(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Body() body: any,
  ) {
    return this.monitoringService.upsertSensorThresholdProfile(sensorId, {
      warningMin: body?.warningMin ?? null,
      warningMax: body?.warningMax ?? null,
      alertMin: body?.alertMin ?? null,
      alertMax: body?.alertMax ?? null,
      cooldownSeconds: body?.cooldownSeconds,
    });
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

  @Get('debug/db')
  @Roles('admin', 'operator', 'viewer')
  getDbDebug(@Query('sensorId') sensorId?: string) {
    return this.monitoringService.getDbDebug(sensorId);
  }

  /**
   * GET /monitoring/ml-health
   * Estado general del sistema de ML (predicciones, sensores analizados, etc.)
   */
  @Get('ml-health')
  @Roles('admin', 'operator', 'viewer')
  getMlHealth() {
    return this.monitoringService.getMlHealth();
  }

  /**
   * DELETE /monitoring/sensors/:sensorId
   * Elimina un sensor (soft delete)
   */
  @Delete('sensors/:sensorId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deleteSensor(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.monitoringService.deleteSensor(sensorId);
  }

  @Get('debug/chart-data/:sensorId')
  @Roles('admin')
  debugChartData(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.monitoringService.debugChartData(sensorId);
  }

  /**
   * Fix: Endpoint de debug para diagnosticar sensores bloqueados
   * Muestra por qué un sensor no es visible en las vistas
   * @param sensorId ID del sensor a diagnosticar
   */
  @Get('debug/sensors/:sensorId')
  @Roles('admin')
  async debugSensor(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.monitoringService.debugSensor(sensorId);
  }

  /**
   * GET /monitoring/sensors/:sensorId/raw-readings?limit=500&since=ISO_DATE
   * 
   * DIAGNÓSTICO: Datos crudos del sensor SIN agregación ni compresión.
   * - Retorna TODAS las lecturas en el rango solicitado
   * - Ordenadas cronológicamente (ASC)
   * - Sin promedios ni buckets
   * - Para gráficas de diagnóstico en tiempo real
   */
  @Get('sensors/:sensorId/raw-readings')
  @Roles('admin', 'operator', 'viewer')
  getRawSensorReadings(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('limit') limit = '500',
    @Query('since') since?: string,
  ) {
    const parsedLimit = Math.min(Math.max(1, Number(limit) || 500), 2000);
    return this.monitoringService.getRawSensorReadings(sensorId, parsedLimit, since);
  }

  /**
   * GET /monitoring/sensors/:sensorId/aggregated?range=1h|6h|24h|7d
   * 
   * Datos agregados por ventana temporal para gráficas históricas.
   * - 1h: datos casi crudos (buckets de 1 min)
   * - 6h: promedios cada 5 min
   * - 24h: promedios cada 1 hora
   * - 7d: promedios diarios
   */
  @Get('sensors/:sensorId/aggregated')
  @Roles('admin', 'operator', 'viewer')
  getAggregatedSensorReadings(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('range') range = '6h',
  ) {
    return this.monitoringService.getAggregatedSensorReadings(sensorId, range);
  }

  /**
   * GET /monitoring/sensors/:sensorId/historical-readings?from=ISO&to=ISO&limit=500
   * 
   * FIX OBJETIVO 1: Lecturas históricas por rango de fechas ABSOLUTAS.
   * 
   * CASO DE USO: Frozen chart para alertas del historial.
   * - Usa `from` y `to` como fechas absolutas (no relativas a AHORA)
   * - Funciona para alertas de hace semanas/meses
   * - triggeredAt es la fuente de verdad
   * 
   * Ejemplo: from=triggeredAt-30min, to=triggeredAt+30min
   */
  @Get('sensors/:sensorId/historical-readings')
  @Roles('admin', 'operator', 'viewer')
  getHistoricalReadings(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit = '500',
  ) {
    const parsedLimit = Math.min(Math.max(1, Number(limit) || 500), 2000);
    return this.monitoringService.getHistoricalReadings(sensorId, from, to, parsedLimit);
  }

  /**
   * POST /monitoring/run-alert-maintenance
   * 
   * Ejecuta manualmente el mantenimiento de alertas:
   * - Auto-resolver alertas cuando valor vuelve a rango
   * - Limpiar alertas por TTL
   * - Limpiar ML events por TTL
   * Solo admin puede ejecutar esto manualmente.
   */
  @Post('run-alert-maintenance')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async runAlertMaintenance() {
    return this.monitoringService.runAlertMaintenance();
  }

  /**
   * GET /monitoring/debug/telemetry-flow?sensorId=123
   * 
   * DIAGNÓSTICO END-TO-END del flujo de telemetría.
   * Verifica:
   * 1. ¿Llegan datos al servidor?
   * 2. ¿Se procesan correctamente?
   * 3. ¿Formato correcto para Flutter?
   * 4. ¿Hay datos recientes?
   */
  @Get('debug/telemetry-flow')
  @Roles('admin', 'operator', 'viewer')
  async debugTelemetryFlow(
    @Query('sensorId') sensorId?: string,
  ) {
    return this.monitoringService.debugTelemetryFlow(sensorId ? Number(sensorId) : undefined);
  }

  /**
   * GET /monitoring/debug/chart-data?sensorId=123&range=1h
   * 
   * DIAGNÓSTICO: Datos exactos que se envían al chart.
   * Muestra estructura, conteo, y sample de puntos.
   */
  @Get('debug/chart-data')
  @Roles('admin', 'operator', 'viewer')
  async debugChartData(
    @Query('sensorId', ParseIntPipe) sensorId: number,
    @Query('range') range = '1h',
  ) {
    return this.monitoringService.debugChartData(sensorId, range);
  }

  // ============================================================================
  // DEV-TOOLS: Endpoints para limpieza de datos (solo admin, solo desarrollo)
  // ============================================================================

  /**
   * DELETE /monitoring/dev-tools/sensor-readings/all
   * 
   * Elimina TODAS las lecturas de sensores.
   * ⚠️ PELIGROSO: Solo para desarrollo/testing.
   * 
   * ISO 27001: Requiere rol admin y deja log de auditoría.
   */
  @Delete('dev-tools/sensor-readings/all')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deleteAllSensorReadings(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub || 'unknown';
    return this.monitoringService.deleteAllSensorReadings(userId);
  }

  /**
   * DELETE /monitoring/dev-tools/sensor-readings/sensor/:sensorId
   * 
   * Elimina todas las lecturas de un sensor específico.
   * ⚠️ PELIGROSO: Solo para desarrollo/testing.
   * 
   * ISO 27001: Requiere rol admin y deja log de auditoría.
   */
  @Delete('dev-tools/sensor-readings/sensor/:sensorId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deleteSensorReadingsBySensor(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub || 'unknown';
    return this.monitoringService.deleteSensorReadingsBySensor(sensorId, userId);
  }
}
