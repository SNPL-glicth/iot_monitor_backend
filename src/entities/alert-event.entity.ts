import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Sensor } from './sensor.entity';
import { Device } from './device.entity';

/**
 * Entidad para historial de eventos de alerta.
 * 
 * DIFERENCIA CON alerts:
 * - alerts: Solo 1 registro activo por (sensor_id, severity) - representa ESTADO
 * - alert_events: Cada violación es un registro independiente - representa EVENTOS
 * 
 * Esto permite:
 * - Historial completo por sensor
 * - Historial por tipo de evento
 * - Auditoría ISO 27001 completa
 */
@Entity('alert_events')
export class AlertEvent {
  @PrimaryGeneratedColumn('increment')
  id!: string;

  @Column({ name: 'sensor_id', type: 'bigint' })
  sensorId!: string;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType!: string; // 'THRESHOLD_VIOLATION', 'DELTA_SPIKE', 'PREDICTION_ANOMALY'

  @Column({ name: 'event_subtype', type: 'varchar', length: 100, nullable: true })
  eventSubtype!: string | null; // 'HIGH', 'LOW', 'RATE_OF_CHANGE'

  @Column({ type: 'varchar', length: 50 })
  severity!: string; // 'info', 'warning', 'critical'

  @Column({ name: 'triggered_value', type: 'decimal', precision: 15, scale: 5 })
  triggeredValue!: number;

  @Column({ name: 'threshold_id', type: 'bigint', nullable: true })
  thresholdId!: string | null;

  @Column({ name: 'threshold_value_min', type: 'decimal', precision: 15, scale: 5, nullable: true })
  thresholdValueMin!: number | null;

  @Column({ name: 'threshold_value_max', type: 'decimal', precision: 15, scale: 5, nullable: true })
  thresholdValueMax!: number | null;

  @Column({ name: 'triggered_at', type: 'datetime2' })
  triggeredAt!: Date;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string; // 'active', 'acknowledged', 'resolved', 'expired'

  @Column({ name: 'acknowledged_at', type: 'datetime2', nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: 'acknowledged_by', type: 'bigint', nullable: true })
  acknowledgedBy!: string | null;

  @Column({ name: 'resolved_at', type: 'datetime2', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'resolved_by', type: 'bigint', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'nvarchar', length: 2000, nullable: true })
  message!: string | null;

  @Column({ type: 'nvarchar', nullable: true })
  metadata!: string | null;

  // Relaciones
  @ManyToOne(() => Sensor, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'sensor_id' })
  sensor!: Sensor;

  @ManyToOne(() => Device, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'device_id' })
  device!: Device;
}
