import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Entidad para notificaciones de alerta.
 * 
 * P5 FIX: Ahora incluye columnas de snapshot para desacoplar del estado.
 * Los datos de snapshot son inmutables y no dependen del estado actual
 * de alerts/ml_events.
 */
@Entity('alert_notifications')
export class AlertNotification {
  @PrimaryGeneratedColumn('increment')
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  source!: string; // 'alert', 'ml_event', 'alert_event'

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

  // =========================================================================
  // P5: Columnas de snapshot (inmutables, no dependen del estado)
  // =========================================================================

  @Column({ name: 'sensor_id', type: 'bigint', nullable: true })
  sensorId!: string | null;

  @Column({ name: 'device_id', type: 'bigint', nullable: true })
  deviceId!: string | null;

  @Column({ name: 'triggered_value', type: 'decimal', precision: 15, scale: 5, nullable: true })
  triggeredValue!: number | null;

  @Column({ name: 'event_type', type: 'varchar', length: 50, nullable: true })
  eventType!: string | null;

  @Column({ name: 'snapshot_data', type: 'nvarchar', nullable: true })
  snapshotData!: string | null; // JSON con contexto completo
}
