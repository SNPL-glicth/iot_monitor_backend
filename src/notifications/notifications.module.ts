import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';

import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { UserDevice } from '../entities/user-device.entity';
import { Device } from '../entities/device.entity';
import { Alert } from '../entities/alert.entity';
import { User } from '../entities/user.entity';
import { AlertNotification } from '../entities/alert-notification.entity';
import { Sensor } from '../entities/sensor.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';

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

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([PushToken, UserDevice, Device, Alert, User, AlertNotification, Sensor]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
