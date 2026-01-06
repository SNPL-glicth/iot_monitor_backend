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
   * Provisiona un dispositivo (para Flutter - NO retorna API key)
   * La API key se genera y almacena, pero solo se muestra en el QR
   */
  async provisionDevice(dto: ProvisionDeviceDto): Promise<ProvisionDeviceResponseDto> {
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

      await queryRunner.commitTransaction();

      // 4. Generar datos para QR (JSON con device_uuid y api_key)
      const qrData = JSON.stringify({
        device_uuid: savedDevice.deviceUuid,
        api_key: apiKey,
        ingest_url: process.env.INGEST_URL || 'http://localhost:8000/ingest/packets',
      });

      return {
        deviceUuid: savedDevice.deviceUuid,
        deviceId: savedDevice.id,
        qrData: qrData,
        message: 'Dispositivo provisionado. Escanee el QR con el dispositivo físico.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Error al provisionar dispositivo: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
