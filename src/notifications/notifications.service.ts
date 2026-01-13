import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';

import { RegisterDeviceDto, AlertPushPayload } from './notifications.dto';
import { UserDevice } from '../entities/user-device.entity';
import { Device } from '../entities/device.entity';
import { Alert } from '../entities/alert.entity';
import { AlertNotification } from '../entities/alert-notification.entity';
import { Sensor } from '../entities/sensor.entity';

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
    private readonly http: HttpService,
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
  }

  async getUnreadNotifications(limit = 100): Promise<AlertNotification[]> {
    return this.alertNotificationRepo.find({
      where: { isRead: false },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async markNotificationsAsRead(ids: string[]): Promise<void> {
    if (!ids.length) return;

    const now = new Date();
    await this.alertNotificationRepo
      .createQueryBuilder()
      .update(AlertNotification)
      .set({ isRead: true, readAt: now })
      .where('id IN (:...ids)', { ids })
      .execute();
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

