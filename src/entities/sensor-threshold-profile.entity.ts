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

  /**
   * ARQUITECTURA DATA-DRIVEN: Umbral de tiempo para considerar sensor como STALE.
   * 
   * Cada sensor puede definir su propio umbral según su naturaleza:
   * - Sensores críticos: 5 minutos (300000 ms)
   * - Sensores estándar: 1 hora (3600000 ms)
   * - Sensores de baja frecuencia: 24 horas (86400000 ms)
   * 
   * Default: 24 horas (86400000 ms) para compatibilidad con comportamiento anterior.
   */
  @Column({ name: 'stale_threshold_ms', type: 'bigint', default: 86400000 })
  staleThresholdMs!: string;

  @Column({ name: 'updated_at', type: 'datetime2', nullable: true })
  updatedAt?: Date | null;
}
