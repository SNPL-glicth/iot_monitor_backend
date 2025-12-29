import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Device } from './device.entity';

@Entity({ name: 'user_devices' })
@Unique(['userId', 'deviceId'])
export class UserDevice {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => User, (u) => u.userDevices, { nullable: false })
  user!: User;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @ManyToOne(() => Device, (d) => d.userDevices, { nullable: false })
  device!: Device;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId!: string;

  @Column({
    name: 'permission_level',
    type: 'varchar',
    length: 50,
    default: 'read',
  })
  permissionLevel!: 'read' | 'write' | 'admin';

  @Column({ name: 'created_at', type: 'datetime2' })
  createdAt!: Date;
}
