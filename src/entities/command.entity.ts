import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Device } from './device.entity';
import { User } from './user.entity';

@Entity({ name: 'commands' })
export class Command {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => Device, (d) => d.commands, { nullable: false })
  device!: Device;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId!: string;

  @ManyToOne(() => User, (u) => u.commands, { nullable: false })
  issuedBy!: User;

  @Column({ name: 'issued_by', type: 'bigint' })
  issuedById!: string;

  @Column({ name: 'command_type', type: 'varchar', length: 100 })
  commandType!: string;

  @Column({ name: 'command_payload', type: 'nvarchar' })
  commandPayload!: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status!: 'pending' | 'sent' | 'executed' | 'failed' | 'timeout';

  @Column({ name: 'issued_at', type: 'datetime2' })
  issuedAt!: Date;

  @Column({ name: 'executed_at', type: 'datetime2', nullable: true })
  executedAt?: Date | null;

  @Column({ name: 'response_payload', type: 'nvarchar', nullable: true })
  responsePayload?: string | null;
}
