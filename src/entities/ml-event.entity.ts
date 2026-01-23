import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Device } from './device.entity';
import { Sensor } from './sensor.entity';
import { Prediction } from './prediction.entity';

/**
 * Entidad para la tabla ml_events.
 * 
 * Eventos/avisos generados por Machine Learning (separados de alerts por umbral).
 * - event_type: notice/warning/critical
 * - event_code: identificador técnico (ej: PRED_THRESHOLD_BREACH, ANOMALY_DETECTED, DELTA_SPIKE)
 * - payload: metadata flexible (JSON)
 */
@Entity({ name: 'ml_events' })
export class MlEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => Device, { nullable: false })
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId!: string;

  @ManyToOne(() => Sensor, { nullable: true })
  @JoinColumn({ name: 'sensor_id' })
  sensor?: Sensor | null;

  @Column({ name: 'sensor_id', type: 'bigint', nullable: true })
  sensorId?: string | null;

  @ManyToOne(() => Prediction, { nullable: true })
  @JoinColumn({ name: 'prediction_id' })
  prediction?: Prediction | null;

  @Column({ name: 'prediction_id', type: 'bigint', nullable: true })
  predictionId?: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType!: string; // 'notice', 'warning', 'critical'

  @Column({ name: 'event_code', type: 'varchar', length: 100 })
  eventCode!: string; // 'PRED_THRESHOLD_BREACH', 'ANOMALY_DETECTED', 'DELTA_SPIKE', etc.

  @Column({ type: 'nvarchar', length: 255 })
  title!: string;

  @Column({ type: 'nvarchar', length: 1000, nullable: true })
  message?: string | null;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string; // 'active', 'acknowledged', 'resolved'

  @Column({ name: 'created_at', type: 'datetime2', default: () => 'GETDATE()' })
  createdAt!: Date;

  @Column({ name: 'acknowledged_at', type: 'datetime2', nullable: true })
  acknowledgedAt?: Date | null;

  @Column({ name: 'acknowledged_by', type: 'bigint', nullable: true })
  acknowledgedBy?: string | null;

  @Column({ name: 'resolved_at', type: 'datetime2', nullable: true })
  resolvedAt?: Date | null;

  @Column({ name: 'resolved_by', type: 'bigint', nullable: true })
  resolvedBy?: string | null;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  payload?: string | null; // JSON metadata
}
