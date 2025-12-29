import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AlertThreshold } from './alert-threshold.entity';

// Historial de cambios de umbrales (no sobrescribir sin contexto)
// Guarda el antes/después de min/max, quién cambió y cuándo.
@Entity({ name: 'threshold_history' })
export class ThresholdHistory {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => AlertThreshold, { nullable: false })
  @JoinColumn({ name: 'threshold_id' })
  threshold!: AlertThreshold;

  @Column({ name: 'threshold_id', type: 'bigint' })
  thresholdId!: string;

  @Column({ name: 'old_min', type: 'decimal', precision: 15, scale: 5, nullable: true })
  oldMin?: string | null;

  @Column({ name: 'old_max', type: 'decimal', precision: 15, scale: 5, nullable: true })
  oldMax?: string | null;

  @Column({ name: 'new_min', type: 'decimal', precision: 15, scale: 5, nullable: true })
  newMin?: string | null;

  @Column({ name: 'new_max', type: 'decimal', precision: 15, scale: 5, nullable: true })
  newMax?: string | null;

  @Column({ name: 'changed_by', type: 'bigint' })
  changedBy!: string;

  @Column({ name: 'changed_at', type: 'datetime2' })
  changedAt!: Date;

  @Column({ name: 'reason', type: 'nvarchar', length: 500, nullable: true })
  reason?: string | null;
}
