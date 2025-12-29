import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('alert_notifications')
export class AlertNotification {
  @PrimaryGeneratedColumn('increment')
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  source!: string; // e.g. 'alert', 'ml_event'

  @Column({ name: 'source_event_id', type: 'bigint' })
  sourceEventId!: string;

  @Column({ type: 'varchar', length: 50 })
  severity!: string;

  @Column({ type: 'nvarchar', length: 255 })
  title!: string;

  @Column({ type: 'nvarchar', length: 2000, nullable: true })
  message!: string | null;

  @Column({ name: 'is_read', type: 'bit', default: () => '0' })
  isRead!: boolean;

  @Column({ name: 'created_at', type: 'datetime2' })
  createdAt!: Date;

  @Column({ name: 'read_at', type: 'datetime2', nullable: true })
  readAt!: Date | null;
}
