import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MlModel } from './ml-model.entity';
import { Sensor } from './sensor.entity';
import { Device } from './device.entity';

@Entity({ name: 'predictions' })
export class Prediction {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => MlModel, (m) => m.predictions, { nullable: false })
  @JoinColumn({ name: 'model_id' })
  model!: MlModel;

  @ManyToOne(() => Sensor, (s) => s.predictions, { nullable: false })
  @JoinColumn({ name: 'sensor_id' })
  sensor!: Sensor;

  @ManyToOne(() => Device, { nullable: false })
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  @Column({ name: 'predicted_value', type: 'decimal', precision: 15, scale: 5 })
  predictedValue!: string;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  confidence!: string;

  @Column({ name: 'predicted_at', type: 'datetime2' })
  predictedAt!: Date;

  @Column({ name: 'target_timestamp', type: 'datetime2' })
  targetTimestamp!: Date;

  // Campos opcionales adicionales según el esquema SQL (no se usan todos aún)
  @Column({ name: 'horizon_minutes', type: 'int', nullable: true })
  horizonMinutes?: number | null;

  @Column({ name: 'trend', type: 'varchar', length: 10, nullable: true })
  trend?: string | null;

  @Column({ name: 'window_points', type: 'int', nullable: true })
  windowPoints?: number | null;

  @Column({ name: 'is_anomaly', type: 'int', nullable: true })
  isAnomaly?: number | null;

  @Column({ name: 'anomaly_score', type: 'float', nullable: true })
  anomalyScore?: number | null;

  @Column({ name: 'risk_level', type: 'varchar', length: 20, nullable: true })
  riskLevel?: string | null;

  @Column({ name: 'severity', type: 'varchar', length: 50, nullable: true })
  severity?: string | null;

  @Column({ name: 'status', type: 'varchar', length: 50, nullable: true })
  status?: string | null;

  @Column({ name: 'explanation', type: 'nvarchar', length: 1000, nullable: true })
  explanation?: string | null;
}
