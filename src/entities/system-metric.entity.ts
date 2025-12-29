import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'system_metrics' })
export class SystemMetric {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'metric_name', type: 'varchar', length: 100 })
  metricName!: string;

  @Column({ name: 'metric_value', type: 'decimal', precision: 15, scale: 5 })
  metricValue!: string;

  @Column({ name: 'metric_unit', type: 'varchar', length: 50 })
  metricUnit!: string;

  @Column({ type: 'datetime2' })
  timestamp!: Date;
}
