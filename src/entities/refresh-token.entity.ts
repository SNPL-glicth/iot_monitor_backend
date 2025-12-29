import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

// Refresh tokens are stored as hashes (never store raw tokens).
@Entity({ name: 'refresh_tokens' })
export class RefreshToken {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user!: User;

  @Column({ name: 'user_id', type: 'bigint' })
  @Index()
  userId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  @Index({ unique: true })
  tokenHash!: string;

  @Column({ name: 'created_at', type: 'datetime2' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'datetime2' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'datetime2', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'replaced_by_id', type: 'bigint', nullable: true })
  replacedById?: string | null;

  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true })
  ip?: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent?: string | null;
}
