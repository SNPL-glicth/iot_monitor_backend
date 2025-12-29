import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';
import { Sensor } from './sensor.entity';

@Entity({ name: 'sensor_readings' })
export class SensorReading {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => Sensor, (s) => s.readings, { nullable: false })
  @JoinColumn({ name: 'sensor_id' })
  sensor!: Sensor;

  // expone el FK sin crear una columna adicional (evita "Invalid column name 'sensorId'")
  @RelationId((sr: SensorReading) => sr.sensor)
  sensorId!: string;

  @Column({ type: 'decimal', precision: 15, scale: 5 })
  value!: string;

  @Column({ type: 'datetime2', precision: 6 })
  timestamp!: Date;
}
