import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Sensor } from './sensor.entity';
import { UserDevice } from './user-device.entity';
import { Alert } from './alert.entity';
import { Command } from './command.entity';
import { DeviceLocation } from './device-location.entity';

@Entity({ name: 'devices' })
export class Device {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'device_uuid', type: 'uniqueidentifier' })
  deviceUuid!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'device_type', type: 'varchar', length: 100 })
  deviceType!: string;

  @Column({ type: 'varchar', length: 50 })
  status!: 'draft' | 'pending_activation' | 'online' | 'offline' | 'maintenance' | 'error';

  @Column({ name: 'provisioning_code', type: 'varchar', length: 20, nullable: true, unique: true })
  provisioningCode?: string | null;

  @Column({ name: 'last_connection', type: 'datetime2', nullable: true })
  lastConnection?: Date | null;

  @Column({ type: 'nvarchar', nullable: true })
  metadata?: string | null;

  @Column({ name: 'created_at', type: 'datetime2' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'datetime2', nullable: true })
  updatedAt?: Date | null;

  // Rate limiting para activación
  @Column({ name: 'activation_attempts', type: 'int', default: 0 })
  activationAttempts!: number;

  @Column({ name: 'last_activation_attempt', type: 'datetime2', nullable: true })
  lastActivationAttempt?: Date | null;

  @Column({ name: 'activated_from_ip', type: 'varchar', length: 45, nullable: true })
  activatedFromIp?: string | null;

  @OneToMany(() => Sensor, (s) => s.device)
  sensors!: Sensor[];

  @OneToMany(() => UserDevice, (ud) => ud.device)
  userDevices!: UserDevice[];

  @OneToMany(() => Alert, (a) => a.device)
  alerts!: Alert[];

  @OneToMany(() => Command, (c) => c.device)
  commands!: Command[];

  @OneToMany(() => DeviceLocation, (dl) => dl.device)
  locations!: DeviceLocation[];
}
