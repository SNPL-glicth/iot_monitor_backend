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

  /**
   * Estados del sensor:
   * - draft: Creado por admin, sin activar
   * - pending_claim: Disponible para que un instalador lo reclame
   * - pending_confirmation: Reservado, esperando confirmación (QR opcional)
   * - online: Activo y enviando datos
   * - offline: Sin conexión
   * - suspended: Suspendido temporalmente
   * - revoked: Revocado permanentemente
   */
  @Column({ type: 'varchar', length: 25, default: 'draft' })
  status!: 'draft' | 'pending_claim' | 'pending_confirmation' | 'online' | 'offline' | 'suspended' | 'revoked';

  @Column({ name: 'claim_token', type: 'varchar', length: 64, nullable: true, unique: true })
  claimToken?: string | null;

  @Column({ name: 'claim_token_expires', type: 'datetime2', nullable: true })
  claimTokenExpires?: Date | null;

  @Column({ name: 'reserved_by_user_id', type: 'bigint', nullable: true })
  reservedByUserId?: string | null;

  @Column({ name: 'reserved_at', type: 'datetime2', nullable: true })
  reservedAt?: Date | null;

  @Column({ name: 'require_qr_confirmation', type: 'bit', default: false })
  requireQrConfirmation!: boolean;

  // ══════════════════════════════════════════════════════════════════════════
  // IDENTIDAD DEL SENSOR (generada en confirm, permanente)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * API Key única del sensor para autenticación en ingesta
   * - Generada en el momento de confirmación (ONLINE)
   * - Nunca expira pero puede ser revocada
   * - Hash almacenado, valor plano solo se muestra una vez
   */
  @Column({ name: 'api_key_hash', type: 'varchar', length: 128, nullable: true })
  apiKeyHash?: string | null;

  /**
   * Prefijo del API key para identificación (primeros 8 chars)
   * Permite identificar qué key está en uso sin exponer el valor completo
   */
  @Column({ name: 'api_key_prefix', type: 'varchar', length: 12, nullable: true })
  apiKeyPrefix?: string | null;

  /**
   * Fecha de activación (cuando pasó a ONLINE)
   */
  @Column({ name: 'activated_at', type: 'datetime2', nullable: true })
  activatedAt?: Date | null;

  /**
   * Usuario que confirmó la activación
   */
  @Column({ name: 'activated_by_user_id', type: 'bigint', nullable: true })
  activatedByUserId?: string | null;

  /**
   * IP desde donde se confirmó la activación
   */
  @Column({ name: 'activated_from_ip', type: 'varchar', length: 45, nullable: true })
  activatedFromIp?: string | null;

  /**
   * Contador de intentos fallidos de confirmación (rate limiting)
   */
  @Column({ name: 'confirm_attempts', type: 'int', default: 0 })
  confirmAttempts!: number;

  /**
   * Último intento de confirmación (para rate limiting)
   */
  @Column({ name: 'last_confirm_attempt', type: 'datetime2', nullable: true })
  lastConfirmAttempt?: Date | null;

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
