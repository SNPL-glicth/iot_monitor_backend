import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Sensor } from './sensor.entity';

@Entity({ name: 'sensor_threshold_profiles' })
export class SensorThresholdProfile {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @OneToOne(() => Sensor, (s) => s.thresholdProfile, { nullable: false })
  @JoinColumn({ name: 'sensor_id' })
  sensor!: Sensor;

  @Column({ name: 'sensor_id', type: 'bigint' })
  sensorId!: string;

  @Column({ name: 'warning_min', type: 'decimal', precision: 15, scale: 5, nullable: true })
  warningMin?: string | null;

  @Column({ name: 'warning_max', type: 'decimal', precision: 15, scale: 5, nullable: true })
  warningMax?: string | null;

  @Column({ name: 'alert_min', type: 'decimal', precision: 15, scale: 5, nullable: true })
  alertMin?: string | null;

  @Column({ name: 'alert_max', type: 'decimal', precision: 15, scale: 5, nullable: true })
  alertMax?: string | null;

  @Column({ name: 'cooldown_seconds', type: 'int', default: 300 })
  cooldownSeconds!: number;

  @Column({ name: 'updated_at', type: 'datetime2', nullable: true })
  updatedAt?: Date | null;
}
