import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Sensor } from './sensor.entity';
import { Prediction } from './prediction.entity';

@Entity({ name: 'ml_models' })
export class MlModel {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => Sensor, (s) => s.models, { nullable: false })
  @JoinColumn({ name: 'sensor_id' })
  sensor!: Sensor;

  @Column({ name: 'model_name', type: 'varchar', length: 255 })
  modelName!: string;

  @Column({ name: 'model_type', type: 'varchar', length: 100 })
  modelType!: string;

  @Column({ type: 'varchar', length: 50 })
  version!: string;

  @Column({ name: 'is_active', type: 'bit', default: false })
  isActive!: boolean;

  @Column({ name: 'trained_at', type: 'datetime2' })
  trainedAt!: Date;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  accuracy?: string | null;

  @Column({ type: 'nvarchar', nullable: true })
  metadata?: string | null;

  @OneToMany(() => Prediction, (p) => p.model)
  predictions!: Prediction[];
}
