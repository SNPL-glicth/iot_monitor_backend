import {
  Controller,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProvisioningService } from './provisioning.service';
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

/**
 * Controller para gestión de dispositivos IoT
 * 
 * FLUJO:
 * 1. Crear dispositivo (lógico) -> POST /devices/create -> estado DRAFT
 * 2. Agregar sensores -> POST /devices/:uuid/sensors
 * 3. Preparar activación -> POST /devices/:uuid/prepare-activation -> estado PENDING_ACTIVATION
 * 4. Firmware activa -> POST /devices/activate -> estado ACTIVE (recibe api_key)
 */
@Controller('devices')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ProvisioningController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  /**
   * PASO 1: Crear dispositivo (lógico)
   * - Solo requiere nombre
   * - Estado: DRAFT
   * - NO genera api_key
   */
  @Post('create')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async createDevice(
    @Body() dto: ProvisionDeviceDto,
  ): Promise<ProvisionDeviceResponseDto> {
    return this.provisioningService.createDevice(dto);
  }

  /**
   * PASO 2: Preparar activación (cuando hay hardware)
   * - Genera provisioning_code
   * - Genera api_key (hasheada, no devuelta)
   * - Estado: PENDING_ACTIVATION
   * - Retorna QR data
   */
  @Post(':deviceUuid/prepare-activation')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async prepareActivation(
    @Param('deviceUuid') deviceUuid: string,
  ): Promise<{ provisioningCode: string; qrData: string }> {
    return this.provisioningService.prepareActivation(deviceUuid);
  }

  /**
   * Legacy: Registra dispositivo con api_key (uso interno/scripts)
   */
  @Post('register')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @Body() dto: RegisterDeviceDto,
  ): Promise<RegisterDeviceResponseDto> {
    return this.provisioningService.registerDevice(dto);
  }

  /**
   * Agrega un sensor a un dispositivo existente
   */
  @Post(':deviceUuid/sensors')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async addSensor(
    @Param('deviceUuid') deviceUuid: string,
    @Body() dto: AddSensorDto,
  ): Promise<AddSensorResponseDto> {
    return this.provisioningService.addSensor(deviceUuid, dto);
  }

  /**
   * Rota la API key de un dispositivo
   * 
   * - Revoca la key anterior
   * - Genera una nueva key
   * - El dispositivo debe actualizarse con la nueva key
   */
  @Post(':deviceUuid/rotate-key')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async rotateApiKey(
    @Param('deviceUuid') deviceUuid: string,
  ): Promise<RotateApiKeyResponseDto> {
    return this.provisioningService.rotateApiKey(deviceUuid);
  }

  /**
   * Revoca todas las API keys de un dispositivo
   * 
   * Útil cuando un dispositivo es comprometido o retirado
   */
  @Delete(':deviceUuid/keys')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async revokeAllKeys(
    @Param('deviceUuid') deviceUuid: string,
  ): Promise<{ message: string }> {
    return this.provisioningService.revokeAllKeys(deviceUuid);
  }
}

/**
 * Controller para activación de dispositivos (FIRMWARE)
 * NO requiere JWT - el firmware no tiene token de usuario
 */
@Controller('devices')
export class DeviceActivationController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  /**
   * Activa un dispositivo IoT (llamado por FIRMWARE, no Flutter)
   * 
   * Firmware envía: provisioning_code, firmware_version
   * Backend retorna: device_uuid, api_key, ingest_url, sensors
   * 
   * ⚠️ NO requiere autenticación JWT (el firmware no tiene token)
   */
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activateDevice(
    @Body() dto: ActivateDeviceDto,
  ): Promise<ActivateDeviceResponseDto> {
    return this.provisioningService.activateDevice(dto);
  }
}
