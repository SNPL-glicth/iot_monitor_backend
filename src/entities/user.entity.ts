import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { UserDevice } from './user-device.entity';
import { Alert } from './alert.entity';
import { Command } from './command.entity';
import { AuditLog } from './audit-log.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  username!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 50, default: 'viewer' })
  role!: 'admin' | 'operator' | 'viewer';

  @Column({ name: 'is_active', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at', type: 'datetime2' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'datetime2', nullable: true })
  updatedAt?: Date | null;

  @OneToMany(() => UserDevice, (ud) => ud.user)
  userDevices!: UserDevice[];

  @OneToMany(() => Alert, (a) => a.acknowledgedBy)
  acknowledgedAlerts!: Alert[];

  @OneToMany(() => Alert, (a) => a.resolvedBy)
  resolvedAlerts!: Alert[];

  @OneToMany(() => Command, (c) => c.issuedBy)
  commands!: Command[];

  @OneToMany(() => AuditLog, (a) => a.user)
  auditLogs!: AuditLog[];
}
