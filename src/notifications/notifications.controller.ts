import { Body, Controller, Get, Post, Req, UseGuards, Headers, HttpCode, Logger } from '@nestjs/common';

import { NotificationsService } from './notifications.service';
import { RegisterDeviceDto } from './notifications.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

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

  /**
   * POST /notifications/internal/trigger-push
   * 
   * ENDPOINT INTERNO para disparar push notifications desde servicios Python.
   * Autenticación via INTERNAL_API_KEY (no JWT).
   * 
   * Body:
   * - type: 'alert' | 'decision'
   * - alertId?: string (si type='alert')
   * - decisionId?: string (si type='decision')
   * - deviceId?: string (para buscar tokens FCM)
   * - title?: string (título custom)
   * - body?: string (mensaje custom)
   */
  @Post('internal/trigger-push')
  @HttpCode(200)
  async triggerPush(
    @Headers('x-internal-key') internalKey: string,
    @Body() body: {
      type: 'alert' | 'decision';
      alertId?: string;
      decisionId?: string;
      deviceId?: string;
      title?: string;
      body?: string;
    },
  ) {
    // Validar API key interna
    const expectedKey = process.env.INTERNAL_API_KEY;
    if (!expectedKey) {
      this.logger.warn('[PUSH] INTERNAL_API_KEY not configured - rejecting internal trigger');
      return { ok: false, error: 'Internal API not configured' };
    }
    if (internalKey !== expectedKey) {
      this.logger.warn('[PUSH] Invalid internal API key attempt');
      return { ok: false, error: 'Unauthorized' };
    }

    this.logger.log(`[PUSH] Trigger received: type=${body.type} alertId=${body.alertId} decisionId=${body.decisionId}`);

    try {
      if (body.type === 'alert' && body.alertId) {
        // Enviar push para alerta crítica
        await this.notificationsService.sendCriticalAlertNotification(body.alertId);
        this.logger.log(`[PUSH] Alert push sent for alertId=${body.alertId}`);
        return { ok: true, sent: 'alert', alertId: body.alertId };
      }

      if (body.type === 'decision' && body.deviceId && body.title) {
        // Enviar push custom para decisión
        await this.notificationsService.sendDecisionNotification(
          body.deviceId,
          body.title,
          body.body || 'Nueva decisión del sistema de inteligencia.',
          body.decisionId,
        );
        this.logger.log(`[PUSH] Decision push sent for deviceId=${body.deviceId}`);
        return { ok: true, sent: 'decision', deviceId: body.deviceId };
      }

      return { ok: false, error: 'Invalid payload' };
    } catch (e) {
      this.logger.error(`[PUSH] Error triggering push: ${e}`);
      return { ok: false, error: String(e) };
    }
  }
}
