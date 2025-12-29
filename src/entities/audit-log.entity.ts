import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => User, (u) => u.auditLogs, { nullable: true })
  user?: User | null;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId?: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 100 })
  actionType!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'bigint', nullable: true })
  entityId?: string | null;

  @Column({ name: 'old_value', type: 'nvarchar', nullable: true })
  oldValue?: string | null;

  @Column({ name: 'new_value', type: 'nvarchar', nullable: true })
  newValue?: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'nvarchar', nullable: true })
  userAgent?: string | null;

  @Column({ type: 'datetime2' })
  timestamp!: Date;
}
