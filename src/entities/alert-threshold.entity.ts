import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Sensor } from './sensor.entity';
import { Alert } from './alert.entity';

@Entity({ name: 'alert_thresholds' })
export class AlertThreshold {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  // Importante: la FK real en SQL Server es `sensor_id`.
  // Si no declaramos JoinColumn, TypeORM asume una columna virtual `sensorId`
  // (camelCase) y termina generando queries que intentan leer `AlertThreshold.sensorId`.
  @ManyToOne(() => Sensor, (s) => s.thresholds, { nullable: false })
  @JoinColumn({ name: 'sensor_id' })
  sensor!: Sensor;

  @Column({ name: 'sensor_id', type: 'bigint' })
  sensorId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'condition_type', type: 'varchar', length: 50 })
  conditionType!: 'greater_than' | 'less_than' | 'equal_to' | 'out_of_range';

  @Column({
    name: 'threshold_value_min',
    type: 'decimal',
    precision: 15,
    scale: 5,
    nullable: true,
  })
  thresholdValueMin?: string | null;

  @Column({
    name: 'threshold_value_max',
    type: 'decimal',
    precision: 15,
    scale: 5,
    nullable: true,
  })
  thresholdValueMax?: string | null;

  @Column({ type: 'varchar', length: 50, default: 'warning' })
  severity!: 'info' | 'warning' | 'critical';

  @Column({ name: 'is_active', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at', type: 'datetime2' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'datetime2', nullable: true })
  updatedAt?: Date | null;

  @OneToMany(() => Alert, (a) => a.threshold)
  alerts!: Alert[];
}
