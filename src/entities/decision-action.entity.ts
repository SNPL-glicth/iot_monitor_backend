import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Device } from './device.entity';

@Entity({ name: 'decision_actions' })
export class DecisionAction {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId: number;

  @ManyToOne(() => Device, { nullable: true })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({ name: 'pattern_signature', type: 'varchar', length: 64 })
  patternSignature: string;

  @Column({ name: 'decision_type', type: 'varchar', length: 50, default: 'monitor' })
  decisionType: string;

  @Column({ type: 'int', default: 3 })
  priority: number;

  @Column({ type: 'varchar', length: 20, default: 'info' })
  severity: string;

  @Column({ type: 'nvarchar', length: 200 })
  title: string;

  @Column({ type: 'nvarchar', length: 500 })
  summary: string;

  @Column({ type: 'nvarchar', nullable: true })
  explanation: string;

  @Column({ name: 'recommended_actions', type: 'nvarchar', nullable: true })
  recommendedActions: string;

  @Column({ name: 'affected_sensors', type: 'nvarchar', nullable: true })
  affectedSensors: string;

  @Column({ name: 'event_count', type: 'int', default: 1 })
  eventCount: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'should_notify', type: 'bit', default: false })
  shouldNotify: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'datetime2', nullable: true })
  expiresAt: Date;

  @Column({ name: 'acknowledged_at', type: 'datetime2', nullable: true })
  acknowledgedAt: Date;

  @Column({ name: 'resolved_at', type: 'datetime2', nullable: true })
  resolvedAt: Date;

  @Column({ name: 'reason_trace', type: 'nvarchar', nullable: true })
  reasonTrace: string;
}
