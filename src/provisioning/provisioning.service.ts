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
   * Provisiona un dispositivo (para Flutter - NO retorna API key)
   * Flutter envía: name, model, provisioning_code
   * Backend valida código, crea dispositivo, genera API key (no la devuelve)
   * Dispositivo queda en PENDING_ACTIVATION hasta que firmware active
   */
  async provisionDevice(dto: ProvisionDeviceDto): Promise<ProvisionDeviceResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Generar código de provisioning si no se proporciona
      const provisioningCode = dto.provisioningCode || this.generateProvisioningCode();

      // 2. Validar que el provisioning_code no esté usado
      if (dto.provisioningCode) {
        const existingDevice = await queryRunner.manager.findOne(Device, {
          where: { provisioningCode: dto.provisioningCode },
        });

        if (existingDevice) {
          throw new BadRequestException('Este código de provisioning ya fue utilizado');
        }
      }

      // 3. Crear el dispositivo en estado PENDING_ACTIVATION
      const device = queryRunner.manager.create(Device, {
        name: dto.name,
        deviceType: dto.model || 'generic',
        status: 'pending_activation',
        provisioningCode: provisioningCode,
        metadata: dto.metadata || null,
      });
      
      const savedDevice = await queryRunner.manager.save(Device, device);

      // 3. Generar API key pero NO devolverla a Flutter
      const apiKey = this.generateApiKey();
      const apiKeyHash = this.hashApiKey(apiKey);

      // 4. Guardar API key hasheada (pendiente de activación)
      const deviceApiKey = queryRunner.manager.create(DeviceApiKey, {
        deviceId: savedDevice.id,
        apiKeyHash: apiKeyHash,
        keyName: 'Primary Key',
        isActive: false, // Se activa cuando el firmware llame a /activate
      });
      
      await queryRunner.manager.save(DeviceApiKey, deviceApiKey);

      await queryRunner.commitTransaction();

      // Flutter NO recibe la API key
      return {
        deviceId: savedDevice.id,
        deviceUuid: savedDevice.deviceUuid,
        status: 'PENDING_ACTIVATION',
        message: 'Dispositivo registrado. Esperando activación del firmware.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Error al provisionar dispositivo: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Activa un dispositivo (llamado por el FIRMWARE, no por Flutter)
   * Firmware envía: provisioning_code, firmware_version
   * Backend retorna: device_uuid, api_key, ingest_url, sensors
   */
  async activateDevice(dto: ActivateDeviceDto): Promise<ActivateDeviceResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Buscar dispositivo por provisioning_code
      const device = await queryRunner.manager.findOne(Device, {
        where: { provisioningCode: dto.provisioningCode },
        relations: ['sensors'],
      });

      if (!device) {
        throw new NotFoundException('Código de provisioning no encontrado');
      }

      if (device.status === 'online' || device.status === 'offline') {
        throw new BadRequestException('Este dispositivo ya fue activado anteriormente');
      }

      // 2. Buscar la API key pendiente
      const apiKeyRecord = await queryRunner.manager.findOne(DeviceApiKey, {
        where: { deviceId: device.id, isActive: false },
      });

      if (!apiKeyRecord) {
        throw new BadRequestException('No hay API key pendiente para este dispositivo');
      }

      // 3. Generar nueva API key para el firmware (la anterior era solo placeholder)
      const newApiKey = this.generateApiKey();
      const newApiKeyHash = this.hashApiKey(newApiKey);

      // 4. Actualizar API key y activar
      apiKeyRecord.apiKeyHash = newApiKeyHash;
      apiKeyRecord.isActive = true;
      await queryRunner.manager.save(DeviceApiKey, apiKeyRecord);

      // 5. Actualizar estado del dispositivo
      device.status = 'offline'; // Esperando primera lectura
      if (dto.firmwareVersion) {
        device.metadata = JSON.stringify({
          ...(device.metadata ? JSON.parse(device.metadata) : {}),
          firmwareVersion: dto.firmwareVersion,
          activatedAt: new Date().toISOString(),
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
      const hasThresholds = dto.warningMin !== undefined || dto.warningMax !== undefined ||
                           dto.alertMin !== undefined || dto.alertMax !== undefined;

      if (hasThresholds) {
        await queryRunner.manager.query(
          `INSERT INTO sensor_threshold_profiles 
           (sensor_id, warning_min, warning_max, alert_min, alert_max, cooldown_seconds)
           VALUES (@0, @1, @2, @3, @4, 300)`,
          [savedSensor.id, dto.warningMin ?? null, dto.warningMax ?? null, 
           dto.alertMin ?? null, dto.alertMax ?? null],
        );
      }

      await queryRunner.commitTransaction();

      return {
        sensorUuid: savedSensor.sensorUuid,
        sensorId: savedSensor.id,
        name: savedSensor.name,
        sensorType: savedSensor.sensorType,
        unit: savedSensor.unit,
        thresholds: hasThresholds ? {
          warningMin: dto.warningMin,
          warningMax: dto.warningMax,
          alertMin: dto.alertMin,
          alertMax: dto.alertMax,
        } : undefined,
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
