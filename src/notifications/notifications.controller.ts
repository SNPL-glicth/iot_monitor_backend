import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { NotificationsService } from './notifications.service';
import { RegisterDeviceDto } from './notifications.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(AuthGuard('jwt') as any)
  @Post('register-device')
  async registerDevice(@Req() req: any, @Body() dto: RegisterDeviceDto) {
    const userId = String(req.user?.sub ?? req.user?.id ?? '');
    await this.notificationsService.registerDevice(userId, dto);
    return { ok: true };
  }

  /**
   * GET /notifications/unread
   * Devuelve notificaciones no leídas (alertas + eventos ML) ordenadas por fecha.
   */
  @UseGuards(AuthGuard('jwt') as any)
  @Get('unread')
  async getUnreadNotifications() {
    const rows = await this.notificationsService.getUnreadNotifications(100);
    return rows.map((n) => ({
      id: n.id,
      source: n.source,
      sourceEventId: n.sourceEventId,
      severity: n.severity,
      title: n.title,
      message: n.message,
      sensorId: (n as any).sensorId ?? null,
      sensorName: (n as any).sensorName ?? null,
      deviceName: (n as any).deviceName ?? null,
      createdAt: n.createdAt,
      isRead: n.isRead,
    }));
  }

  /**
   * POST /notifications/mark-read
   * Marca un conjunto de notificaciones como leídas.
   */
  @UseGuards(AuthGuard('jwt') as any)
  @Post('mark-read')
  async markRead(@Body('ids') ids: string[]) {
    await this.notificationsService.markNotificationsAsRead(ids ?? []);
    return { ok: true };
  }
}
