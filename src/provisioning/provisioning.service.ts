import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { Device } from '../entities/device.entity';
import { Sensor } from '../entities/sensor.entity';
import { DeviceApiKey } from '../entities/device-api-key.entity';
import {
  RegisterDeviceDto,
  RegisterDeviceResponseDto,
  AddSensorDto,
  AddSensorResponseDto,
  RotateApiKeyResponseDto,
  ProvisionDeviceDto,
  ProvisionDeviceResponseDto,
  ActivateDeviceDto,
  ActivateDeviceResponseDto,
  DefineSensorDto,
  DefineSensorResponseDto,
  PendingSensorDto,
  ReserveSensorResponseDto,
  ConfirmSensorDto,
  ConfirmSensorResponseDto,
} from './provisioning.dto';

@Injectable()
export class ProvisioningService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(DeviceApiKey)
    private readonly apiKeyRepo: Repository<DeviceApiKey>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Genera una API key segura (32 bytes = 64 caracteres hex)
   */
  private generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Genera el hash SHA256 de una API key
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Crea un perfil de umbrales para un sensor
   * Método privado para evitar duplicación de código SQL
   */
  private async createThresholdProfile(
    manager: any,
    sensorId: string,
    thresholds: {
      warningMin?: number;
      warningMax?: number;
      alertMin?: number;
      alertMax?: number;
    },
  ): Promise<void> {
    const hasThresholds = thresholds.warningMin !== undefined || 
                          thresholds.warningMax !== undefined ||
                          thresholds.alertMin !== undefined || 
                          thresholds.alertMax !== undefined;

    if (!hasThresholds) return;

    await manager.query(
      `INSERT INTO sensor_threshold_profiles 
       (sensor_id, warning_min, warning_max, alert_min, alert_max, cooldown_seconds)
       VALUES (@0, @1, @2, @3, @4, 300)`,
      [sensorId, thresholds.warningMin ?? null, thresholds.warningMax ?? null, 
       thresholds.alertMin ?? null, thresholds.alertMax ?? null],
    );
  }

  /**
   * Registra un nuevo dispositivo con su API key única
   */
  async registerDevice(dto: RegisterDeviceDto): Promise<RegisterDeviceResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Crear el dispositivo
      const device = queryRunner.manager.create(Device, {
        name: dto.name,
        deviceType: dto.deviceType,
        status: 'offline',
        metadata: dto.metadata || null,
      });
      
      const savedDevice = await queryRunner.manager.save(Device, device);

      // 2. Generar API key
      const apiKey = this.generateApiKey();
      const apiKeyHash = this.hashApiKey(apiKey);

      // 3. Guardar API key hasheada
      const deviceApiKey = queryRunner.manager.create(DeviceApiKey, {
        deviceId: savedDevice.id,
        apiKeyHash: apiKeyHash,
        keyName: 'Primary Key',
        isActive: true,
      });
      
      await queryRunner.manager.save(DeviceApiKey, deviceApiKey);

      // 4. Crear sensores si se especificaron
      const createdSensors: {
        sensorUuid: string;
        sensorId: string;
        name: string;
        sensorType: string;
        unit: string;
      }[] = [];

      if (dto.sensors && dto.sensors.length > 0) {
        for (const sensorDef of dto.sensors) {
          const sensor = queryRunner.manager.create(Sensor, {
            device: savedDevice,
            sensorType: sensorDef.sensorType,
            name: sensorDef.name,
            unit: sensorDef.unit,
            isActive: true,
          });
          
          const savedSensor = await queryRunner.manager.save(Sensor, sensor);
          
          createdSensors.push({
            sensorUuid: savedSensor.sensorUuid,
            sensorId: savedSensor.id,
            name: savedSensor.name,
            sensorType: savedSensor.sensorType,
            unit: savedSensor.unit,
          });
        }
      }

      await queryRunner.commitTransaction();

      // 5. Retornar la API key en texto plano (SOLO ESTA VEZ)
      return {
        deviceUuid: savedDevice.deviceUuid,
        deviceId: savedDevice.id,
        deviceApiKey: apiKey, // La key se muestra solo al registrar
        sensors: createdSensors,
        message: 'Dispositivo registrado exitosamente. Guarde la API key, no se mostrará de nuevo.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Error al registrar dispositivo: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Genera un código de provisioning único (formato: XXXX-XXXX-XXX)
   */
  private generateProvisioningCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const part3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `${part1}-${part2}-${part3}`;
  }

  /**
   * PASO 1: Crear dispositivo (lógico)
   * - Solo requiere nombre
   * - Estado: DRAFT
   * - NO genera api_key
   * - NO requiere provisioning_code
   */
  async createDevice(dto: ProvisionDeviceDto): Promise<ProvisionDeviceResponseDto> {
    const device = this.deviceRepo.create({
      name: dto.name,
      deviceType: dto.model || 'generic',
      status: 'draft',
      provisioningCode: null,
      metadata: dto.metadata || null,
    });
    
    const savedDevice = await this.deviceRepo.save(device);

    return {
      deviceId: savedDevice.id,
      deviceUuid: savedDevice.deviceUuid,
      status: 'DRAFT',
      message: 'Dispositivo creado. Agregue sensores y luego active con QR.',
    };
  }

  /**
   * PASO 2: Preparar activación (desde Flutter, cuando hay hardware)
   * - Genera provisioning_code único
   * - Genera api_key (hasheada, no devuelta)
   * - Estado: PENDING_ACTIVATION
   * - Retorna QR data para el firmware
   */
  async prepareActivation(deviceUuid: string): Promise<{ provisioningCode: string; qrData: string }> {
    const device = await this.deviceRepo.findOne({
      where: { deviceUuid },
    });

    if (!device) {
      throw new NotFoundException(`Dispositivo ${deviceUuid} no encontrado`);
    }

    if (device.status !== 'draft') {
      throw new BadRequestException(`Dispositivo ya está en estado ${device.status}`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Generar código de provisioning único
      const provisioningCode = this.generateProvisioningCode();

      // 2. Generar API key (no se devuelve a Flutter)
      const apiKey = this.generateApiKey();
      const apiKeyHash = this.hashApiKey(apiKey);

      // 3. Guardar API key hasheada
      const deviceApiKey = queryRunner.manager.create(DeviceApiKey, {
        deviceId: device.id,
        apiKeyHash: apiKeyHash,
        keyName: 'Primary Key',
        isActive: false, // Se activa cuando firmware llame a /activate
      });
      await queryRunner.manager.save(DeviceApiKey, deviceApiKey);

      // 4. Actualizar dispositivo
      device.provisioningCode = provisioningCode;
      device.status = 'pending_activation';
      await queryRunner.manager.save(Device, device);

      await queryRunner.commitTransaction();

      // 5. Generar QR data para el firmware
      const qrData = JSON.stringify({
        provisioning_code: provisioningCode,
        model: device.deviceType,
      });

      return {
        provisioningCode,
        qrData,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Error al preparar activación: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Activa un dispositivo (llamado por el FIRMWARE, no por Flutter)
   * Firmware envía: provisioning_code, firmware_version
   * Backend retorna: device_uuid, api_key, ingest_url, sensors
   * 
   * ⚠️ Rate limiting:
   * - Máx 5 intentos por provisioning_code
   * - Cooldown de 1 minuto entre intentos
   * - IP registrada para auditoría
   */
  async activateDevice(dto: ActivateDeviceDto, clientIp?: string): Promise<ActivateDeviceResponseDto> {
    const MAX_ATTEMPTS = 5;
    const RATE_LIMIT_WINDOW_MS = 60000; // 1 minuto

    // 1. Buscar dispositivo por provisioning_code
    const device = await this.deviceRepo.findOne({
      where: { provisioningCode: dto.provisioningCode },
      relations: ['sensors'],
    });

    if (!device) {
      // No revelar si el código existe o no
      throw new BadRequestException('Código de activación inválido o expirado');
    }

    const now = new Date();

    // ═══════════════════════════════════════════════════════════════════════
    // RATE LIMITING
    // ═══════════════════════════════════════════════════════════════════════
    if (device.activationAttempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Máximo de intentos excedido. Contacte al administrador.');
    }

    if (device.lastActivationAttempt) {
      const timeSinceLastAttempt = now.getTime() - device.lastActivationAttempt.getTime();
      if (timeSinceLastAttempt < RATE_LIMIT_WINDOW_MS) {
        throw new BadRequestException(
          `Demasiados intentos. Espere ${Math.ceil((RATE_LIMIT_WINDOW_MS - timeSinceLastAttempt) / 1000)} segundos.`
        );
      }
    }

    // Registrar intento
    device.activationAttempts += 1;
    device.lastActivationAttempt = now;
    await this.deviceRepo.save(device);

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDACIONES
    // ═══════════════════════════════════════════════════════════════════════
    if (device.status === 'online' || device.status === 'offline') {
      throw new BadRequestException('Este dispositivo ya fue activado anteriormente');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 2. Buscar la API key pendiente
      const apiKeyRecord = await queryRunner.manager.findOne(DeviceApiKey, {
        where: { deviceId: device.id, isActive: false },
      });

      if (!apiKeyRecord) {
        throw new BadRequestException('No hay API key pendiente para este dispositivo');
      }

      // 3. Generar nueva API key para el firmware
      const newApiKey = this.generateApiKey();
      const newApiKeyHash = this.hashApiKey(newApiKey);

      // 4. Actualizar API key y activar
      apiKeyRecord.apiKeyHash = newApiKeyHash;
      apiKeyRecord.isActive = true;
      await queryRunner.manager.save(DeviceApiKey, apiKeyRecord);

      // 5. Actualizar estado del dispositivo
      device.status = 'offline'; // Esperando primera lectura
      device.activationAttempts = 0; // Reset intentos en éxito
      device.lastActivationAttempt = null;
      device.activatedFromIp = clientIp || null;
      if (dto.firmwareVersion) {
        device.metadata = JSON.stringify({
          ...(device.metadata ? JSON.parse(device.metadata) : {}),
          firmwareVersion: dto.firmwareVersion,
          activatedAt: now.toISOString(),
        });
      }
      await queryRunner.manager.save(Device, device);

      await queryRunner.commitTransaction();

      // 6. Retornar datos al firmware (INCLUYE API KEY)
      return {
        deviceUuid: device.deviceUuid,
        deviceApiKey: newApiKey,
        ingestUrl: process.env.INGEST_URL || 'http://localhost:8000/ingest/packets',
        sensors: (device.sensors || []).map(s => ({
          sensorUuid: s.sensorUuid,
          sensorType: s.sensorType,
          name: s.name,
          unit: s.unit,
        })),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Error al activar dispositivo: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Agrega un sensor a un dispositivo existente con umbrales opcionales
   */
  async addSensor(deviceUuid: string, dto: AddSensorDto): Promise<AddSensorResponseDto> {
    const device = await this.deviceRepo.findOne({
      where: { deviceUuid },
    });

    if (!device) {
      throw new NotFoundException(`Dispositivo ${deviceUuid} no encontrado`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Crear el sensor
      const sensor = queryRunner.manager.create(Sensor, {
        device: device,
        sensorType: dto.sensorType,
        name: dto.name,
        unit: dto.unit,
        isActive: true,
      });

      const savedSensor = await queryRunner.manager.save(Sensor, sensor);

      // 2. Crear umbrales si se especificaron
      const thresholds = {
        warningMin: dto.warningMin,
        warningMax: dto.warningMax,
        alertMin: dto.alertMin,
        alertMax: dto.alertMax,
      };
      await this.createThresholdProfile(queryRunner.manager, savedSensor.id, thresholds);

      const hasThresholds = dto.warningMin !== undefined || dto.warningMax !== undefined ||
                           dto.alertMin !== undefined || dto.alertMax !== undefined;

      await queryRunner.commitTransaction();

      return {
        sensorUuid: savedSensor.sensorUuid,
        sensorId: savedSensor.id,
        name: savedSensor.name,
        sensorType: savedSensor.sensorType,
        unit: savedSensor.unit,
        thresholds: hasThresholds ? thresholds : undefined,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Error al agregar sensor: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * PASO 1 SENSOR: Definir sensor (lógico, sin hardware)
   * - Solo tipo, unidad, umbrales
   * - Estado: DRAFT
   * - NO tiene nombre aún (viene del QR)
   * - NO está activo físicamente
   */
  async defineSensor(deviceUuid: string, dto: DefineSensorDto): Promise<DefineSensorResponseDto> {
    const device = await this.deviceRepo.findOne({
      where: { deviceUuid },
    });

    if (!device) {
      throw new NotFoundException(`Dispositivo ${deviceUuid} no encontrado`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Crear definición del sensor en estado DRAFT
      const sensor = queryRunner.manager.create(Sensor, {
        device: device,
        sensorType: dto.sensorType,
        name: `${dto.sensorType}_pending`, // Nombre temporal hasta activación
        unit: dto.unit,
        status: 'draft',
        isActive: false, // NO activo hasta activación
      });

      const savedSensor = await queryRunner.manager.save(Sensor, sensor);

      // 2. Crear umbrales si se especificaron
      const thresholds = {
        warningMin: dto.warningMin,
        warningMax: dto.warningMax,
        alertMin: dto.alertMin,
        alertMax: dto.alertMax,
      };
      await this.createThresholdProfile(queryRunner.manager, savedSensor.id, thresholds);

      const hasThresholds = dto.warningMin !== undefined || dto.warningMax !== undefined ||
                           dto.alertMin !== undefined || dto.alertMax !== undefined;

      await queryRunner.commitTransaction();

      return {
        sensorUuid: savedSensor.sensorUuid,
        sensorId: savedSensor.id,
        sensorType: savedSensor.sensorType,
        unit: savedSensor.unit,
        status: 'DRAFT',
        thresholds: hasThresholds ? thresholds : undefined,
        message: 'Sensor definido. Siguiente paso: escanear QR del hardware.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Error al definir sensor: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * PASO 2: Publicar sensor (hacerlo disponible para claim)
   * Estado: DRAFT → PENDING_CLAIM
   * 
   * Validaciones:
   * - Sensor debe estar en estado DRAFT
   * - Dispositivo padre debe estar activo (offline/online)
   */
  async publishSensor(
    sensorUuid: string,
    requireQrConfirmation: boolean = false,
  ): Promise<{ sensorUuid: string; status: string; message: string }> {
    const sensor = await this.sensorRepo.findOne({
      where: { sensorUuid },
      relations: ['device'],
    });

    if (!sensor) {
      throw new NotFoundException(`Sensor ${sensorUuid} no encontrado`);
    }

    if (sensor.status !== 'draft') {
      throw new BadRequestException(`Sensor debe estar en estado DRAFT. Estado actual: ${sensor.status}`);
    }

    // Validar que el dispositivo padre esté activo
    const deviceStatus = sensor.device?.status;
    if (deviceStatus !== 'online' && deviceStatus !== 'offline') {
      throw new BadRequestException(
        `El dispositivo padre debe estar activo primero. Estado actual: ${deviceStatus}`
      );
    }

    sensor.status = 'pending_claim';
    sensor.requireQrConfirmation = requireQrConfirmation;
    await this.sensorRepo.save(sensor);

    return {
      sensorUuid: sensor.sensorUuid,
      status: 'PENDING_CLAIM',
      message: 'Sensor publicado. Disponible para que un instalador lo reclame.',
    };
  }

  /**
   * PASO 3: Reservar sensor (instalador selecciona)
   * Estado: PENDING_CLAIM → PENDING_CONFIRMATION
   * Genera claim_token temporal
   */
  async reserveSensor(
    sensorUuid: string,
    userId: string,
    expiresInMinutes: number = 15,
  ): Promise<ReserveSensorResponseDto> {
    const sensor = await this.sensorRepo.findOne({
      where: { sensorUuid },
      relations: ['device'],
    });

    if (!sensor) {
      throw new NotFoundException(`Sensor ${sensorUuid} no encontrado`);
    }

    if (sensor.status !== 'pending_claim') {
      throw new BadRequestException(`Sensor no está disponible para claim. Estado: ${sensor.status}`);
    }

    // Generar claim_token
    const claimToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

    // Reservar sensor
    sensor.status = 'pending_confirmation';
    sensor.claimToken = claimToken;
    sensor.claimTokenExpires = expiresAt;
    sensor.reservedByUserId = userId;
    sensor.reservedAt = new Date();
    await this.sensorRepo.save(sensor);

    // Generar QR solo si es requerido
    let qrData: string | undefined;
    if (sensor.requireQrConfirmation) {
      qrData = JSON.stringify({
        type: 'sensor_confirm',
        claim_token: claimToken,
        sensor_uuid: sensorUuid,
      });
    }

    return {
      sensorUuid: sensor.sensorUuid,
      sensorType: sensor.sensorType,
      unit: sensor.unit,
      deviceName: sensor.device.name,
      claimToken: claimToken,
      claimTokenExpires: expiresAt.toISOString(),
      requireQrConfirmation: sensor.requireQrConfirmation,
      qrData: qrData,
      message: sensor.requireQrConfirmation
        ? 'Sensor reservado. Escanee el QR para confirmar.'
        : 'Sensor reservado. Puede confirmar directamente.',
    };
  }

  /**
   * PASO 4: Confirmar activación del sensor
   * Estado: PENDING_CONFIRMATION → ONLINE
   * 
   * AUTH IMPLÍCITA por claim_token de un solo uso
   * 
   * Validaciones:
   * 1. Token existe
   * 2. Token no expirado
   * 3. Token no usado (sensor en PENDING_CONFIRMATION)
   * 4. Rate limiting: máx 3 intentos por token
   * 
   * En éxito:
   * - Genera API Key permanente del sensor
   * - Invalida claim_token
   * - Cambia estado a ONLINE
   * 
   *  NO acepta nombre - el admin lo asigna después
   */
  async confirmSensor(
    dto: ConfirmSensorDto,
    clientIp?: string,
  ): Promise<ConfirmSensorResponseDto> {
    const MAX_ATTEMPTS = 3;
    const RATE_LIMIT_WINDOW_MS = 60000; // 1 minuto

    // Buscar sensor por claim_token
    const sensor = await this.sensorRepo.findOne({
      where: { claimToken: dto.claimToken },
      relations: ['device'],
    });

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDACIÓN 1: Token existe
    // ═══════════════════════════════════════════════════════════════════════
    if (!sensor) {
      // No revelar si el token existe o no
      throw new BadRequestException('Token inválido o expirado');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDACIÓN 2: Rate limiting por token
    // ═══════════════════════════════════════════════════════════════════════
    const now = new Date();
    
    // Verificar si excedió intentos
    if (sensor.confirmAttempts >= MAX_ATTEMPTS) {
      // Liberar sensor y invalidar token
      sensor.status = 'pending_claim';
      sensor.claimToken = null;
      sensor.claimTokenExpires = null;
      sensor.reservedByUserId = null;
      sensor.reservedAt = null;
      sensor.confirmAttempts = 0;
      await this.sensorRepo.save(sensor);
      throw new BadRequestException('Máximo de intentos excedido. El sensor ha sido liberado.');
    }

    // Rate limit: 1 intento por minuto
    if (sensor.lastConfirmAttempt) {
      const timeSinceLastAttempt = now.getTime() - sensor.lastConfirmAttempt.getTime();
      if (timeSinceLastAttempt < RATE_LIMIT_WINDOW_MS) {
        throw new BadRequestException(
          `Demasiados intentos. Espere ${Math.ceil((RATE_LIMIT_WINDOW_MS - timeSinceLastAttempt) / 1000)} segundos.`
        );
      }
    }

    // Registrar intento
    sensor.confirmAttempts += 1;
    sensor.lastConfirmAttempt = now;
    await this.sensorRepo.save(sensor);

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDACIÓN 3: Estado correcto
    // ═══════════════════════════════════════════════════════════════════════
    if (sensor.status !== 'pending_confirmation') {
      throw new BadRequestException('Token inválido o expirado');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDACIÓN 4: Token no expirado
    // ═══════════════════════════════════════════════════════════════════════
    if (sensor.claimTokenExpires && now > sensor.claimTokenExpires) {
      // Revertir a pending_claim
      sensor.status = 'pending_claim';
      sensor.claimToken = null;
      sensor.claimTokenExpires = null;
      sensor.reservedByUserId = null;
      sensor.reservedAt = null;
      sensor.confirmAttempts = 0;
      await this.sensorRepo.save(sensor);
      throw new BadRequestException('Token expirado. El sensor ha sido liberado.');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAR IDENTIDAD DEL SENSOR (API Key)
    // ═══════════════════════════════════════════════════════════════════════
    const sensorApiKey = this.generateSensorApiKey();
    const apiKeyPrefix = sensorApiKey.substring(0, 8);
    const apiKeyHash = this.hashApiKey(sensorApiKey);

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVAR SENSOR
    // ═══════════════════════════════════════════════════════════════════════
    // Nombre temporal - el admin lo cambia después
    sensor.name = `${sensor.sensorType}_${sensor.sensorUuid.substring(0, 8)}`;
    sensor.status = 'online';
    sensor.isActive = true;
    
    // Limpiar claim_token (ya no se usa)
    sensor.claimToken = null;
    sensor.claimTokenExpires = null;
    sensor.confirmAttempts = 0;
    sensor.lastConfirmAttempt = null;
    
    // Establecer identidad permanente
    sensor.apiKeyHash = apiKeyHash;
    sensor.apiKeyPrefix = apiKeyPrefix;
    sensor.activatedAt = now;
    sensor.activatedFromIp = clientIp || null;
    
    sensor.updatedAt = now;
    await this.sensorRepo.save(sensor);

    return {
      sensorUuid: sensor.sensorUuid,
      sensorId: sensor.id,
      name: sensor.name,
      sensorType: sensor.sensorType,
      unit: sensor.unit,
      deviceUuid: sensor.device.deviceUuid,
      deviceName: sensor.device.name,
      status: 'ONLINE',
      sensorApiKey: sensorApiKey, // ⚠️ SOLO SE MUESTRA UNA VEZ
      apiKeyPrefix: apiKeyPrefix,
      message: '⚠️ Guarde el API Key de forma segura. No se mostrará de nuevo.',
    };
  }

  /**
   * Genera API Key del sensor (prefijo snsr_ + 24 bytes hex)
   */
  private generateSensorApiKey(): string {
    return `snsr_${crypto.randomBytes(24).toString('hex')}`;
  }

  /**
   * Lista sensores disponibles para claim (PENDING_CLAIM)
   * Filtrado opcional por tipo de sensor
   */
  async getClaimableSensors(sensorType?: string): Promise<PendingSensorDto[]> {
    const whereClause: any = { status: 'pending_claim' };
    if (sensorType) {
      whereClause.sensorType = sensorType;
    }

    const sensors = await this.sensorRepo.find({
      where: whereClause,
      relations: ['device'],
      order: { createdAt: 'DESC' },
    });

    return sensors.map((sensor) => ({
      sensorUuid: sensor.sensorUuid,
      sensorType: sensor.sensorType,
      unit: sensor.unit,
      deviceUuid: sensor.device.deviceUuid,
      deviceName: sensor.device.name,
      status: sensor.status,
      createdAt: sensor.createdAt.toISOString(),
    }));
  }

  /**
   * Rota la API key de un dispositivo (revoca la anterior y genera una nueva)
   */
  async rotateApiKey(deviceUuid: string): Promise<RotateApiKeyResponseDto> {
    const device = await this.deviceRepo.findOne({
      where: { deviceUuid },
    });

    if (!device) {
      throw new NotFoundException(`Dispositivo ${deviceUuid} no encontrado`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Revocar todas las keys activas anteriores
      await queryRunner.manager.update(
        DeviceApiKey,
        { deviceId: device.id, isActive: true, revokedAt: null },
        { revokedAt: new Date(), isActive: false },
      );

      // 2. Generar nueva API key
      const newApiKey = this.generateApiKey();
      const newApiKeyHash = this.hashApiKey(newApiKey);

      // 3. Guardar nueva API key
      const deviceApiKey = queryRunner.manager.create(DeviceApiKey, {
        deviceId: device.id,
        apiKeyHash: newApiKeyHash,
        keyName: 'Rotated Key',
        isActive: true,
      });

      await queryRunner.manager.save(DeviceApiKey, deviceApiKey);

      await queryRunner.commitTransaction();

      return {
        deviceUuid: device.deviceUuid,
        newApiKey: newApiKey,
        message: 'API key rotada exitosamente. La key anterior ha sido revocada.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Error al rotar API key: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Elimina un sensor (soft delete o hard delete según estado)
   * Permite eliminar si:
   * - Sensor está inactivo (isActive: false)
   * - Sensor está en estados: draft, pending_claim, pending_confirmation
   * - Dispositivo está offline
   */
  async deleteSensor(sensorId: string): Promise<{ message: string }> {
    const sensor = await this.sensorRepo.findOne({
      where: { id: sensorId },
      relations: ['device'],
    });

    if (!sensor) {
      throw new NotFoundException(`Sensor ${sensorId} no encontrado`);
    }

    const allowedStates = ['draft', 'pending_claim', 'pending_confirmation', 'revoked'];
    const currentStatus = (sensor.status || '').toLowerCase();
    const deviceStatus = (sensor.device?.status || '').toLowerCase();
    const isDeviceOnline = deviceStatus === 'online';
    
    // Permitir eliminar si:
    // 1. Sensor está inactivo, O
    // 2. Status está en estados permitidos, O
    // 3. Dispositivo está offline
    const canDelete = !sensor.isActive || 
                      allowedStates.includes(currentStatus) || 
                      !isDeviceOnline;

    if (!canDelete) {
      throw new BadRequestException(
        `No se puede eliminar un sensor activo mientras el dispositivo está online. ` +
        `Desactive el sensor primero o espere a que el dispositivo esté offline.`
      );
    }

    // Soft delete: marcar como revocado
    await this.sensorRepo.update(sensorId, {
      isActive: false,
      status: 'revoked',
      updatedAt: new Date(),
    });

    return {
      message: `Sensor ${sensor.name || sensorId} eliminado correctamente.`,
    };
  }

  /**
   * Actualiza datos básicos de un sensor (nombre)
   */
  async updateSensor(sensorId: string, data: { name?: string }): Promise<{ message: string }> {
    const sensor = await this.sensorRepo.findOne({
      where: { id: sensorId },
    });

    if (!sensor) {
      throw new NotFoundException(`Sensor ${sensorId} no encontrado`);
    }

    if (data.name) {
      sensor.name = data.name;
    }
    sensor.updatedAt = new Date();
    
    await this.sensorRepo.save(sensor);

    return {
      message: `Sensor actualizado correctamente.`,
    };
  }

  /**
   * Elimina un dispositivo (soft delete)
   * 
   * Permite eliminar si:
   * - Dispositivo está en estados: draft, pending_activation, offline
   * - No tiene sensores activos online
   */
  async deleteDevice(deviceId: string): Promise<{ message: string }> {
    const device = await this.deviceRepo.findOne({
      where: { id: deviceId },
      relations: ['sensors'],
    });

    if (!device) {
      throw new NotFoundException(`Dispositivo ${deviceId} no encontrado`);
    }

    const allowedStates = ['draft', 'pending_activation', 'offline', 'error', 'deleted'];
    const currentStatus = (device.status || '').toLowerCase();
    
    // Verificar si hay sensores activos online
    const activeSensorsOnline = (device.sensors || []).filter(
      s => s.isActive && s.status === 'online'
    );

    const canDelete = allowedStates.includes(currentStatus) || activeSensorsOnline.length === 0;

    if (!canDelete) {
      throw new BadRequestException(
        `No se puede eliminar un dispositivo con sensores activos online. ` +
        `Desactive los sensores primero o espere a que estén offline.`
      );
    }

    // Soft delete: marcar dispositivo y todos sus sensores como revocados
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Revocar todos los sensores del dispositivo
      await queryRunner.manager.update(
        Sensor,
        { device: { id: deviceId } },
        { isActive: false, status: 'revoked', updatedAt: new Date() }
      );

      // Revocar todas las API keys
      await queryRunner.manager.update(
        DeviceApiKey,
        { deviceId: device.id, revokedAt: IsNull() },
        { revokedAt: new Date(), isActive: false }
      );

      // Marcar dispositivo como eliminado (soft delete explícito)
      await queryRunner.manager.update(
        Device,
        { id: deviceId },
        { status: 'deleted', updatedAt: new Date() }
      );

      await queryRunner.commitTransaction();

      return {
        message: `Dispositivo ${device.name || deviceId} y sus ${device.sensors?.length || 0} sensores eliminados correctamente.`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Revoca todas las API keys de un dispositivo (desactiva el dispositivo)
   */
  async revokeAllKeys(deviceUuid: string): Promise<{ message: string }> {
    const device = await this.deviceRepo.findOne({
      where: { deviceUuid },
    });

    if (!device) {
      throw new NotFoundException(`Dispositivo ${deviceUuid} no encontrado`);
    }

    await this.apiKeyRepo.update(
      { deviceId: device.id, isActive: true, revokedAt: IsNull() },
      { revokedAt: new Date(), isActive: false },
    );

    return {
      message: `Todas las API keys del dispositivo ${deviceUuid} han sido revocadas.`,
    };
  }

}
