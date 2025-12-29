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
}
