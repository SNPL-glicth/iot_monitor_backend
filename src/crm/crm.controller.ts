import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CrmService } from './crm.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('devices')
  @Roles('admin', 'operator', 'viewer')
  listDevices(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.crm.listDevices(
      {
        q,
        status,
        type,
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 20,
      },
      { userId: String(req.user?.userId ?? ''), role: req.user?.role },
    );
  }

  @Get('devices/:id/profile')
  @Roles('admin', 'operator', 'viewer')
  getDeviceProfile(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.crm.getDeviceProfile(id, {
      userId: String(req.user?.userId ?? ''),
      role: req.user?.role,
    });
  }

  // Perfil completo estilo CRM en una sola llamada: profile + history + KPIs
  @Get('devices/:id/profile-full')
  @Roles('admin', 'operator', 'viewer')
  getDeviceProfileFull(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('bucket') bucket?: '1m' | '5m' | '1h',
    @Query('maxPoints') maxPoints = '400',
    @Query('sensorIds') sensorIds?: string,
    @Query('maxSensors') maxSensors = '6',
    @Query('alertsLimit') alertsLimit = '50',
  ) {
    return this.crm.getDeviceProfileFull(
      id,
      {
        from,
        to,
        bucket,
        maxPoints: Number(maxPoints) || 400,
        sensorIds,
        maxSensors: Number(maxSensors) || 6,
        alertsLimit: Number(alertsLimit) || 50,
      },
      { userId: String(req.user?.userId ?? ''), role: req.user?.role },
    );
  }

  @Get('devices/:id/timeline')
  @Roles('admin', 'operator', 'viewer')
  getDeviceTimeline(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.crm.getDeviceTimeline(
      id,
      {
        from,
        to,
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 50,
      },
      { userId: String(req.user?.userId ?? ''), role: req.user?.role },
    );
  }

  // Device history “CRM style”: series agregadas multi-sensor + KPIs (sin raw masivo)
  // Ejemplo:
  // GET /crm/devices/1/history?from=2025-12-15T00:00:00Z&to=2025-12-16T00:00:00Z&bucket=5m&sensorIds=1,2,3&maxPoints=400
  @Get('devices/:id/history')
  @Roles('admin', 'operator', 'viewer')
  getDeviceHistory(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('bucket') bucket?: '1m' | '5m' | '1h',
    @Query('maxPoints') maxPoints = '400',
    @Query('sensorIds') sensorIds?: string,
    @Query('maxSensors') maxSensors = '6',
  ) {
    return this.crm.getDeviceHistory(
      id,
      {
        from,
        to,
        bucket,
        maxPoints: Number(maxPoints) || 400,
        sensorIds,
        maxSensors: Number(maxSensors) || 6,
      },
      { userId: String(req.user?.userId ?? ''), role: req.user?.role },
    );
  }

  @Get('alerts')
  @Roles('admin', 'operator', 'viewer')
  listAlerts(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('deviceId') deviceId?: string,
    @Query('sensorId') sensorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.crm.listAlerts(
      {
        status,
        severity,
        deviceId,
        sensorId,
        from,
        to,
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 50,
      },
      { userId: String(req.user?.userId ?? ''), role: req.user?.role },
    );
  }

  @Post('alerts/:id/ack')
  @Roles('admin', 'operator')
  acknowledgeAlert(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.crm.acknowledgeAlert(id, {
      userId: String(req.user?.userId ?? ''),
      role: req.user?.role,
    });
  }

  @Post('alerts/:id/resolve')
  @Roles('admin', 'operator')
  resolveAlert(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.crm.resolveAlert(id, {
      userId: String(req.user?.userId ?? ''),
      role: req.user?.role,
    });
  }

  /**
   * GET /crm/alerts/:id/snapshot
   * 
   * FIX ARQUITECTÓNICO: Obtener snapshot INMUTABLE de la alerta.
   * 
   * El snapshot contiene:
   * - Serie temporal congelada al momento del trigger
   * - Umbrales vigentes al momento del trigger
   * - Metadatos del sensor/dispositivo
   * 
   * Este snapshot NUNCA cambia, independientemente de cuánto tiempo pase.
   */
  @Get('alerts/:id/snapshot')
  @Roles('admin', 'operator', 'viewer')
  getAlertSnapshot(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.crm.getAlertSnapshot(id, {
      userId: String(req.user?.userId ?? ''),
      role: req.user?.role,
    });
  }

  @Get('dashboard')
  @Roles('admin', 'operator', 'viewer')
  getDashboard(
    @Req() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('alertsLimit') alertsLimit = '50',
    @Query('eventsLimit') eventsLimit = '50',
    @Query('topDevicesLimit') topDevicesLimit = '10',
  ) {
    return this.crm.getDashboard(
      {
        from,
        to,
        alertsLimit: Number(alertsLimit) || 50,
        eventsLimit: Number(eventsLimit) || 50,
        topDevicesLimit: Number(topDevicesLimit) || 10,
      },
      { userId: String(req.user?.userId ?? ''), role: req.user?.role },
    );
  }

  // Campanita ML: contador de eventos activos
  @Get('ml-events/badge')
  @Roles('admin', 'operator', 'viewer')
  getMlEventsBadge(@Req() req: any) {
    return this.crm.getMlEventsBadge({
      userId: String(req.user?.userId ?? ''),
      role: req.user?.role,
    });
  }

  // Lista de eventos ML recientes (para panel de advertencias ML)
  @Get('ml-events')
  @Roles('admin', 'operator', 'viewer')
  listMlEvents(
    @Req() req: any,
    @Query('deviceId') deviceId?: string,
    @Query('sensorId') sensorId?: string,
    @Query('eventType') eventType?: string,
    @Query('eventCode') eventCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.crm.listMlEvents(
      {
        deviceId,
        sensorId,
        eventType,
        eventCode,
        from,
        to,
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 50,
      },
      { userId: String(req.user?.userId ?? ''), role: req.user?.role },
    );
  }

  @Get('sensors/:sensorId/series')
  @Roles('admin', 'operator', 'viewer')
  getSensorSeries(
    @Param('sensorId', ParseIntPipe) sensorId: number,
    @Req() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('bucket') bucket?: '1m' | '5m' | '1h',
    @Query('maxPoints') maxPoints = '400',
  ) {
    return this.crm.getSensorSeries(
      sensorId,
      {
        from,
        to,
        bucket,
        maxPoints: Number(maxPoints) || 400,
      },
      { userId: String(req.user?.userId ?? ''), role: req.user?.role },
    );
  }
}
