import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Device } from './device.entity';

@Entity({ name: 'device_api_keys' })
export class DeviceApiKey {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId!: string;

  @Column({ name: 'api_key_hash', type: 'varchar', length: 64 })
  apiKeyHash!: string;

  @Column({ name: 'key_name', type: 'varchar', length: 100, nullable: true })
  keyName?: string | null;

  @Column({ name: 'created_at', type: 'datetime2' })
  createdAt!: Date;

  @Column({ name: 'last_used_at', type: 'datetime2', nullable: true })
  lastUsedAt?: Date | null;

  @Column({ name: 'expires_at', type: 'datetime2', nullable: true })
  expiresAt?: Date | null;

  @Column({ name: 'revoked_at', type: 'datetime2', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'is_active', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ type: 'nvarchar', nullable: true })
  metadata?: string | null;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device!: Device;
}
