import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Device } from './device.entity';
import { SensorReading } from './sensor-reading.entity';
import { AlertThreshold } from './alert-threshold.entity';
import { Alert } from './alert.entity';
import { MlModel } from './ml-model.entity';
import { Prediction } from './prediction.entity';
import { SensorThresholdProfile } from './sensor-threshold-profile.entity';

@Entity({ name: 'sensors' })
export class Sensor {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => Device, (d) => d.sensors, { nullable: false })
  @JoinColumn({ name: 'device_id' })
  device!: Device;

  @Column({ name: 'sensor_uuid', type: 'uniqueidentifier' })
  sensorUuid!: string;

  @Column({ name: 'sensor_type', type: 'varchar', length: 100 })
  sensorType!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  unit!: string;

  @Column({ name: 'is_active', type: 'bit', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at', type: 'datetime2' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'datetime2', nullable: true })
  updatedAt?: Date | null;

  @OneToMany(() => SensorReading, (sr) => sr.sensor)
  readings!: SensorReading[];

  @OneToMany(() => AlertThreshold, (t) => t.sensor)
  thresholds!: AlertThreshold[];

  @OneToMany(() => Alert, (a) => a.sensor)
  alerts!: Alert[];

  @OneToMany(() => MlModel, (m) => m.sensor)
  models!: MlModel[];

  @OneToMany(() => Prediction, (p) => p.sensor)
  predictions!: Prediction[];

  @OneToOne(() => SensorThresholdProfile, (p) => p.sensor)
  thresholdProfile?: SensorThresholdProfile;
}
