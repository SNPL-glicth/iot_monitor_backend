import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AlertThreshold } from './alert-threshold.entity';
import { Sensor } from './sensor.entity';
import { Device } from './device.entity';
import { User } from './user.entity';

@Entity({ name: 'alerts' })
export class Alert {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => AlertThreshold, (t) => t.alerts, { nullable: true })
  threshold?: AlertThreshold | null;

  @Column({ name: 'threshold_id', type: 'bigint', nullable: true })
  thresholdId?: string | null;

  @ManyToOne(() => Sensor, (s) => s.alerts, { nullable: false })
  sensor!: Sensor;

  @Column({ name: 'sensor_id', type: 'bigint' })
  sensorId!: string;

  @ManyToOne(() => Device, (d) => d.alerts, { nullable: false })
  device!: Device;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId!: string;

  @Column({ type: 'varchar', length: 50 })
  severity!: 'info' | 'warning' | 'critical';

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: 'active' | 'acknowledged' | 'resolved';

  @Column({ name: 'triggered_value', type: 'decimal', precision: 15, scale: 5 })
  triggeredValue!: string;

  @Column({ name: 'triggered_at', type: 'datetime2' })
  triggeredAt!: Date;

  @Column({ name: 'acknowledged_at', type: 'datetime2', nullable: true })
  acknowledgedAt?: Date | null;

  @Column({ name: 'acknowledged_by', type: 'bigint', nullable: true })
  acknowledgedById?: string | null;

  @ManyToOne(() => User, (u) => u.acknowledgedAlerts, { nullable: true })
  acknowledgedBy?: User | null;

  @Column({ name: 'resolved_at', type: 'datetime2', nullable: true })
  resolvedAt?: Date | null;

  @Column({ name: 'resolved_by', type: 'bigint', nullable: true })
  resolvedById?: string | null;

  @ManyToOne(() => User, (u) => u.resolvedAlerts, { nullable: true })
  resolvedBy?: User | null;
}
