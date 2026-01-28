import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AlertEventsService } from './alert-events.service';

/**
 * Controller para historial de eventos de alerta.
 * 
 * Endpoints:
 * - GET /sensors/:sensorId/events - Historial de eventos de un sensor
 * - GET /devices/:deviceId/events - Historial de eventos de un dispositivo
 * - GET /sensors/:sensorId/events/stats - Estadísticas de eventos
 * - POST /events/:eventId/ack - Marcar evento como acknowledged
 * - POST /events/:eventId/resolve - Marcar evento como resuelto
 */
@Controller()
@UseGuards(AuthGuard('jwt'))
export class AlertEventsController {
  constructor(private readonly alertEventsService: AlertEventsService) {}

  /**
   * Obtiene el historial de eventos de un sensor.
   * 
   * Query params:
   * - eventType: Filtrar por tipo (THRESHOLD_VIOLATION, DELTA_SPIKE)
   * - severity: Filtrar por severidad (info, warning, critical)
   * - status: Filtrar por estado (active, acknowledged, resolved)
   * - from: Fecha inicio (ISO string)
   * - to: Fecha fin (ISO string)
   * - limit: Máximo de resultados (default: 100)
   */
  @Get('sensors/:sensorId/events')
  async getSensorEvents(
    @Param('sensorId') sensorId: string,
    @Query('eventType') eventType?: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const events = await this.alertEventsService.getSensorEventHistory(sensorId, {
      eventType,
      severity,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
    });

    return {
      sensorId,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        eventSubtype: e.eventSubtype,
        severity: e.severity,
        triggeredValue: e.triggeredValue,
        thresholdMin: e.thresholdValueMin,
        thresholdMax: e.thresholdValueMax,
        triggeredAt: e.triggeredAt,
        status: e.status,
        acknowledgedAt: e.acknowledgedAt,
        resolvedAt: e.resolvedAt,
        title: e.title,
        message: e.message,
      })),
    };
  }

  /**
   * Obtiene estadísticas de eventos de un sensor.
   */
  @Get('sensors/:sensorId/events/stats')
  async getSensorEventStats(@Param('sensorId') sensorId: string) {
    return this.alertEventsService.getSensorEventStats(sensorId);
  }

  /**
   * Obtiene el historial de eventos de un dispositivo.
   */
  @Get('devices/:deviceId/events')
  async getDeviceEvents(
    @Param('deviceId') deviceId: string,
    @Query('eventType') eventType?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
  ) {
    const events = await this.alertEventsService.getDeviceEventHistory(deviceId, {
      eventType,
      severity,
      limit: limit ? parseInt(limit, 10) : 100,
    });

    return {
      deviceId,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        sensorId: e.sensorId,
        eventType: e.eventType,
        eventSubtype: e.eventSubtype,
        severity: e.severity,
        triggeredValue: e.triggeredValue,
        triggeredAt: e.triggeredAt,
        status: e.status,
        title: e.title,
        message: e.message,
      })),
    };
  }

  /**
   * Marca un evento como acknowledged.
   */
  @Post('events/:eventId/ack')
  async acknowledgeEvent(
    @Param('eventId') eventId: string,
    @Body() body: { userId: string },
  ) {
    await this.alertEventsService.acknowledgeEvent(eventId, body.userId);
    return { success: true, eventId, status: 'acknowledged' };
  }

  /**
   * Marca un evento como resuelto.
   */
  @Post('events/:eventId/resolve')
  async resolveEvent(
    @Param('eventId') eventId: string,
    @Body() body: { userId: string },
  ) {
    await this.alertEventsService.resolveEvent(eventId, body.userId);
    return { success: true, eventId, status: 'resolved' };
  }
}
