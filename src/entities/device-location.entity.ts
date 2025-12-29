import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Device } from './device.entity';

@Entity({ name: 'device_locations' })
export class DeviceLocation {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  // IMPORTANT: la columna en DB es `device_id` (no `deviceId`).
  // Si no se especifica JoinColumn, TypeORM (SQL Server) intentará usar `deviceId`
  // y rompe con: Invalid column name 'deviceId'.
  @ManyToOne(() => Device, (d) => d.locations, { nullable: false })
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  @Column({ type: 'decimal', precision: 10, scale: 8 })
  latitude!: string;

  @Column({ type: 'decimal', precision: 11, scale: 8 })
  longitude!: string;

  @Column({ type: 'datetime2' })
  timestamp!: Date;
}
