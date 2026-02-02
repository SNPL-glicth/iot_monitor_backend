import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { AlertPublisher } from '../mqtt/alert.publisher';

import { RegisterDeviceDto, AlertPushPayload } from './notifications.dto';
import { UserDevice } from '../entities/user-device.entity';
import { Device } from '../entities/device.entity';
import { Alert } from '../entities/alert.entity';
import { AlertNotification } from '../entities/alert-notification.entity';
import { Sensor } from '../entities/sensor.entity';
import { DataSource } from 'typeorm';

// Pequeña entidad inline para mapear push_tokens sin crear un archivo nuevo grande.
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../entities/user.entity';

@Entity('push_tokens')
class PushToken {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'fcm_token', type: 'nvarchar', length: 512, unique: true })
  fcmToken!: string;

  @Column({ type: 'varchar', length: 20 })
  platform!: string;

  @Column({ name: 'is_active', type: 'bit', default: () => '1' })
  isActive!: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(PushToken)
    private readonly pushTokenRepo: Repository<PushToken>,
    @InjectRepository(UserDevice)
    private readonly userDeviceRepo: Repository<UserDevice>,
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(AlertNotification)
    private readonly alertNotificationRepo: Repository<AlertNotification>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    private readonly dataSource: DataSource,
    private readonly http: HttpService,
    @Optional() private readonly alertPublisher?: AlertPublisher,
  ) {}

  async registerDevice(userId: string, dto: RegisterDeviceDto): Promise<void> {
    const existing = await this.pushTokenRepo.findOne({ where: { fcmToken: dto.fcmToken } });

    if (existing) {
      existing.userId = userId;
      existing.platform = dto.platform;
      existing.isActive = true;
      await this.pushTokenRepo.save(existing);
    } else {
      const created = this.pushTokenRepo.create({
        userId,
        fcmToken: dto.fcmToken,
        platform: dto.platform,
        isActive: true,
      });
      await this.pushTokenRepo.save(created);
    }

    this.logger.log(`Registered push token for user ${userId} platform=${dto.platform}`);
  }

  private async getFcmTokensForDevice(deviceId: string): Promise<string[]> {
    // Usuarios asociados al device (user_devices)
    const userDevices = await this.userDeviceRepo.find({
      where: { deviceId: String(deviceId) },
    });

    if (!userDevices.length) {
      return [];
    }

    const userIds = userDevices.map((ud) => ud.userId);

    const tokens = await this.pushTokenRepo
      .createQueryBuilder('pt')
      .where('pt.userId IN (:...uids)', { uids: userIds })
      .andWhere('pt.isActive = 1')
      .getMany();

    return tokens.map((t) => t.fcmToken);
  }

  async sendAlertNotification(alertId: string): Promise<void> {
    const alert = await this.alertRepo.findOne({ where: { id: alertId } });
    if (!alert) {
      this.logger.warn(`sendAlertNotification: alert not found id=${alertId}`);
      return;
    }

    // Solo alertas warning/critical
    const sev = String(alert.severity).toLowerCase();
    if (sev !== 'warning' && sev !== 'critical') {
      return;
    }

    const device = await this.deviceRepo.findOne({ where: { id: alert.deviceId } });
    if (!device) {
      this.logger.warn(`sendAlertNotification: device not found id=${alert.deviceId}`);
      return;
    }

    const tokens = await this.getFcmTokensForDevice(String(alert.deviceId));
    if (!tokens.length) {
      this.logger.log(
        `sendAlertNotification: no push tokens for deviceId=${alert.deviceId} alertId=${alert.id}`,
      );
      return;
    }

    const titlePrefix = sev === 'critical' ? 'ALERTA CRÍTICA' : 'Alerta';
    const title = `${titlePrefix}: ${device.name}`;
    const body = `Se detectó una alerta (${alert.severity}) en el dispositivo ${device.name}.`;

    const payload: AlertPushPayload = {
      title,
      body,
      data: {
        deviceId: String(alert.deviceId),
        sensorId: String(alert.sensorId),
        alertId: String(alert.id),
      },
    };

    await this.sendFcm(tokens, payload);

    // MQTT: Publicar alerta para entrega instantánea
    if (this.alertPublisher?.isEnabled) {
      const sensor = await this.sensorRepo.findOne({ where: { id: alert.sensorId } });
      
      await this.alertPublisher.publishThresholdAlert({
        id: String(alert.id),
        sensorId: String(alert.sensorId),
        severity: sev,
        triggeredValue: typeof alert.triggeredValue === 'number' ? alert.triggeredValue : null,
        message: body,
        deviceId: String(alert.deviceId),
        deviceName: device.name,
        sensorName: sensor?.name,
      });

      // Publicar notificaciones a usuarios asociados
      const userDevices = await this.userDeviceRepo.find({
        where: { deviceId: String(alert.deviceId) },
      });
      const userIds = userDevices.map((ud) => ud.userId);

      for (const userId of userIds) {
        await this.alertPublisher.publishNotification({
          id: `alert-${alert.id}-${userId}`,
          userId,
          source: 'alert',
          severity: sev,
          title,
          message: body,
          sensorId: String(alert.sensorId),
          sensorName: sensor?.name,
          deviceName: device.name,
        });
      }
    }
  }

  /**
   * Obtiene notificaciones no leídas con prioridad correcta.
   * 
   * SSOT = alert_notifications (DB)
   * 
   * PRIORIDAD (ORDER BY):
   * 1. source = 'alert' primero (alertas físicas > ML)
   * 2. severity = 'critical' > 'warning' > otros
   * 3. created_at DESC (más reciente primero)
   * 
   * REGLAS DE SUPRESIÓN:
   * 1. Si hay alertas activas para un sensor, NO mostrar ML events de ese sensor.
   * 2. NO mostrar notificaciones de sensores en INITIALIZING o STALE (no pueden generar eventos).
   */
  async getUnreadNotifications(limit = 100): Promise<
    Array<
      AlertNotification & {
        sensorId?: string | null;
        sensorName?: string | null;
        deviceName?: string | null;
      }
    >
  > {
    // FIX: Query actualizada para incluir alert_events (nueva tabla de historial)
    // Ahora soporta 3 fuentes: 'alert', 'ml_event', 'alert_event'
    const rows = await this.dataSource.query(
      `
      SELECT TOP (@0)
        n.id,
        n.source,
        n.source_event_id AS sourceEventId,
        n.severity,
        n.title,
        n.message,
        n.is_read AS isRead,
        n.created_at AS createdAt,
        COALESCE(ae.sensor_id, a.sensor_id, me.sensor_id) AS sensorId,
        COALESCE(s1.name, s2.name, s3.name) AS sensorName,
        COALESCE(d1.name, d2.name, d3.name) AS deviceName,
        COALESCE(s1.operational_state, s2.operational_state, s3.operational_state) AS operationalState,
        ae.event_type AS eventType,
        ae.triggered_value AS triggeredValue,
        CASE 
          WHEN n.source = 'alert_event' AND n.severity = 'critical' THEN 0
          WHEN n.source = 'alert' AND n.severity = 'critical' THEN 1
          WHEN n.source = 'alert_event' AND n.severity = 'warning' THEN 2
          WHEN n.source = 'alert' AND n.severity = 'warning' THEN 3
          WHEN n.source = 'alert' THEN 4
          WHEN n.source = 'ml_event' THEN 10
          ELSE 20
        END AS priority
      FROM dbo.alert_notifications n WITH (NOLOCK)
      LEFT JOIN dbo.alert_events ae WITH (NOLOCK)
        ON n.source = 'alert_event' AND ae.id = n.source_event_id
      LEFT JOIN dbo.alerts a WITH (NOLOCK)
        ON n.source = 'alert' AND a.id = n.source_event_id
      LEFT JOIN dbo.ml_events me WITH (NOLOCK)
        ON n.source = 'ml_event' AND me.id = n.source_event_id
      LEFT JOIN dbo.sensors s1 WITH (NOLOCK)
        ON s1.id = ae.sensor_id
      LEFT JOIN dbo.sensors s2 WITH (NOLOCK)
        ON s2.id = a.sensor_id
      LEFT JOIN dbo.sensors s3 WITH (NOLOCK)
        ON s3.id = me.sensor_id
      LEFT JOIN dbo.devices d1 WITH (NOLOCK)
        ON d1.id = ae.device_id
      LEFT JOIN dbo.devices d2 WITH (NOLOCK)
        ON d2.id = a.device_id
      LEFT JOIN dbo.devices d3 WITH (NOLOCK)
        ON d3.id = me.device_id
      WHERE n.is_read = 0
        AND (
          COALESCE(s1.operational_state, s2.operational_state, s3.operational_state) IN ('NORMAL', 'WARNING', 'ALERT')
          OR COALESCE(s1.operational_state, s2.operational_state, s3.operational_state) IS NULL
          OR COALESCE(ae.sensor_id, a.sensor_id, me.sensor_id) IS NULL
        )
      ORDER BY priority ASC, n.created_at DESC
      `,
      [limit],
    );

    return (rows ?? []).map((r: any) => ({
      id: String(r.id),
      source: String(r.source ?? ''),
      sourceEventId: r.sourceEventId !== null && r.sourceEventId !== undefined ? String(r.sourceEventId) : null,
      severity: String(r.severity ?? ''),
      title: String(r.title ?? ''),
      message: r.message !== null && r.message !== undefined ? String(r.message) : null,
      isRead: Boolean(r.isRead),
      createdAt: r.createdAt,
      readAt: null,
      sensorId: r.sensorId !== null && r.sensorId !== undefined ? String(r.sensorId) : null,
      sensorName: r.sensorName !== null && r.sensorName !== undefined ? String(r.sensorName) : null,
      deviceName: r.deviceName !== null && r.deviceName !== undefined ? String(r.deviceName) : null,
    }));
  }

  async markNotificationsAsRead(ids: string[]): Promise<void> {
    if (!ids.length) return;

    this.logger.log(`markNotificationsAsRead: marking ${ids.length} notifications as read`);
    this.logger.debug(`IDs to mark: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''}`);

    const now = new Date();
    
    // Convertir IDs a números para evitar problemas de tipo con BIGINT
    const numericIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    
    if (numericIds.length === 0) {
      this.logger.warn('markNotificationsAsRead: no valid numeric IDs provided');
      return;
    }

    try {
      // Usar query raw para evitar problemas de tipo con TypeORM
      const result = await this.dataSource.query(
        `UPDATE dbo.alert_notifications 
         SET is_read = 1, read_at = @0 
         WHERE id IN (${numericIds.join(',')})`,
        [now],
      );
      
      this.logger.log(`markNotificationsAsRead: updated ${result?.rowsAffected ?? 'unknown'} rows`);
    } catch (error) {
      this.logger.error(`markNotificationsAsRead error: ${error}`);
      throw error;
    }
  }

  private async sendFcm(tokens: string[], payload: AlertPushPayload): Promise<void> {
    const serverKey = process.env.FCM_SERVER_KEY;
    if (!serverKey) {
      this.logger.warn('FCM_SERVER_KEY not configured; skipping push notification');
      return;
    }

    const body = {
      registration_ids: tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ?? {},
      priority: 'high',
    };

    try {
      const res$ = this.http.post('https://fcm.googleapis.com/fcm/send', body, {
        headers: {
          Authorization: `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
      });
      const res: any = await firstValueFrom(res$);
      this.logger.log(`FCM response: ${res.status} ${JSON.stringify(res.data)}`);
    } catch (e) {
      this.logger.error(`Error sending FCM notification: ${e}`);
    }
  }

  /**
   * TAREA 7: Envía notificación crítica completa (push + email).
   * Se envía cuando un sensor supera un umbral crítico.
   */
  async sendCriticalAlertNotification(alertId: string): Promise<void> {
    const alert = await this.alertRepo.findOne({
      where: { id: alertId },
      relations: ['sensor', 'threshold'],
    });

    if (!alert) {
      this.logger.warn(`sendCriticalAlertNotification: alert not found id=${alertId}`);
      return;
    }

    // Solo alertas críticas
    const sev = String(alert.severity).toLowerCase();
    if (sev !== 'critical') {
      this.logger.log(`sendCriticalAlertNotification: skipping non-critical alert id=${alertId}`);
      return;
    }

    const device = await this.deviceRepo.findOne({ where: { id: alert.deviceId } });
    const sensor = alert.sensor;

    if (!device) {
      this.logger.warn(`sendCriticalAlertNotification: device not found id=${alert.deviceId}`);
      return;
    }

    // 1. Enviar push notification
    await this.sendAlertNotification(alertId);

    // 1.5. MQTT: Publicar alerta crítica a broadcast
    if (this.alertPublisher?.isEnabled) {
      await this.alertPublisher.publishCriticalBroadcast({
        id: String(alert.id),
        sensorId: String(alert.sensorId),
        severity: 'critical',
        triggeredValue: typeof alert.triggeredValue === 'number' ? alert.triggeredValue : null,
        message: `Alerta crítica en ${device.name}`,
        deviceId: String(alert.deviceId),
        deviceName: device.name,
        sensorName: sensor?.name,
      });
    }

    // 2. Enviar emails urgentes (máximo 2 destinatarios)
    await this.sendCriticalEmails(alert, device, sensor);
  }

  /**
   * TAREA 7: Envía emails urgentes para alertas críticas.
   * Configurable via variables de entorno.
   */
  private async sendCriticalEmails(
    alert: Alert,
    device: Device,
    sensor?: Sensor,
  ): Promise<void> {
    // Obtener destinatarios de variables de entorno
    const emailRecipients = process.env.CRITICAL_ALERT_EMAILS;
    if (!emailRecipients) {
      this.logger.warn('CRITICAL_ALERT_EMAILS not configured; skipping email notification');
      return;
    }

    // Parsear destinatarios (separados por coma)
    const recipients = emailRecipients
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.includes('@'))
      .slice(0, 2); // Máximo 2 destinatarios

    if (recipients.length === 0) {
      this.logger.warn('No valid email recipients configured');
      return;
    }

    // Verificar configuración SMTP
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT || '587';
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'iot-alerts@sistema.local';

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.warn('SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS required); skipping email');
      return;
    }

    const sensorName = sensor?.name || 'Sensor desconocido';
    const sensorType = sensor?.sensorType || '';
    const deviceName = device.name || 'Dispositivo';
    const triggeredValue = alert.triggeredValue ?? 'N/A';
    const triggeredAt = alert.triggeredAt
      ? new Date(alert.triggeredAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
      : 'N/A';

    const subject = `🚨 [URGENTE] Alerta Crítica IoT - ${sensorName}`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">🚨 ALERTA CRÍTICA</h1>
        </div>
        <div style="padding: 20px; background: #fef2f2; border: 1px solid #fecaca;">
          <h2 style="color: #991b1b; margin-top: 0;">Se ha detectado una condición crítica</h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #fecaca;"><strong>Dispositivo:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #fecaca;">${deviceName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #fecaca;"><strong>Sensor:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #fecaca;">${sensorName} (${sensorType})</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #fecaca;"><strong>Valor detectado:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #fecaca; color: #dc2626; font-weight: bold;">${triggeredValue}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #fecaca;"><strong>Fecha/Hora:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #fecaca;">${triggeredAt}</td>
            </tr>
            <tr>
              <td style="padding: 8px;"><strong>ID Alerta:</strong></td>
              <td style="padding: 8px;">${alert.id}</td>
            </tr>
          </table>
          
          <div style="margin-top: 20px; padding: 15px; background: #fee2e2; border-radius: 8px;">
            <p style="margin: 0; color: #991b1b;">
              <strong>⚠️ Acción requerida:</strong> Por favor revise el sistema inmediatamente.
            </p>
          </div>
        </div>
        <div style="padding: 15px; background: #f3f4f6; text-align: center; font-size: 12px; color: #6b7280;">
          Este es un mensaje automático del Sistema de Monitoreo IoT.
        </div>
      </div>
    `;

    // Enviar emails usando HTTP a un servicio SMTP o directamente
    for (const recipient of recipients) {
      try {
        await this.sendEmailViaSmtp({
          host: smtpHost,
          port: parseInt(smtpPort, 10),
          user: smtpUser,
          pass: smtpPass,
          from: smtpFrom,
          to: recipient,
          subject,
          html: htmlBody,
        });
        this.logger.log(`Critical alert email sent to ${recipient} for alert ${alert.id}`);
      } catch (e) {
        this.logger.error(`Failed to send critical alert email to ${recipient}: ${e}`);
      }
    }
  }

  /**
   * TAREA 7: Envía email via SMTP usando HTTP service (SendGrid/Mailgun compatible).
   * Si SMTP_API_URL está configurado, usa API REST; sino, loguea para configuración manual.
   */
  private async sendEmailViaSmtp(config: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const apiUrl = process.env.SMTP_API_URL;

    if (apiUrl) {
      // Usar API REST (SendGrid, Mailgun, etc.)
      const apiKey = process.env.SMTP_API_KEY || config.pass;

      try {
        const res$ = this.http.post(
          apiUrl,
          {
            from: config.from,
            to: config.to,
            subject: config.subject,
            html: config.html,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        await firstValueFrom(res$);
      } catch (e) {
        throw new Error(`SMTP API error: ${e}`);
      }
    } else {
      // Sin API configurada, loguear para que el admin configure
      this.logger.log(
        `[EMAIL PENDING] To: ${config.to}, Subject: ${config.subject}. ` +
          `Configure SMTP_API_URL para envío automático.`,
      );
    }
  }

  /**
   * Envía push notification para una decisión del Decision Orchestrator.
   * Llamado desde endpoint interno cuando should_notify=true.
   */
  async sendDecisionNotification(
    deviceId: string,
    title: string,
    body: string,
    decisionId?: string,
  ): Promise<void> {
    const tokens = await this.getFcmTokensForDevice(deviceId);
    if (!tokens.length) {
      this.logger.log(
        `sendDecisionNotification: no push tokens for deviceId=${deviceId}`,
      );
      return;
    }

    const payload: AlertPushPayload = {
      title,
      body,
      data: {
        type: 'decision',
        deviceId,
        decisionId: decisionId || '',
      },
    };

    await this.sendFcm(tokens, payload);
    this.logger.log(`[PUSH] Decision notification sent to ${tokens.length} devices for deviceId=${deviceId}`);
  }

  /**
   * TAREA 7: Obtiene destinatarios de alertas para un sensor específico.
   * Busca usuarios asociados al dispositivo del sensor.
   */
  async getAlertRecipients(sensorId: string): Promise<string[]> {
    // Buscar sensor y su dispositivo
    const sensor = await this.sensorRepo.findOne({
      where: { id: sensorId },
      relations: ['device'],
    });

    if (!sensor || !sensor.device) {
      return [];
    }

    // Buscar usuarios asociados al dispositivo
    const userDevices = await this.userDeviceRepo.find({
      where: { deviceId: sensor.device.id },
      relations: ['user'],
    });

    // Extraer emails de usuarios (si tienen)
    const emails: string[] = [];
    for (const ud of userDevices) {
      if (ud.user && (ud.user as any).email) {
        emails.push((ud.user as any).email);
      }
    }

    return emails.slice(0, 2); // Máximo 2 destinatarios
  }
}

