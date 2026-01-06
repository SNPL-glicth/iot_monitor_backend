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
 * Controller para registro y provisioning de dispositivos IoT
 * 
 * FLUJO:
 * 1. Admin registra dispositivo -> POST /devices/register
 * 2. Sistema genera device_uuid + api_key única
 * 3. Admin configura api_key en el dispositivo físico
 * 4. Dispositivo envía datos a Ingest API con X-Device-Key
 */
@Controller('devices')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ProvisioningController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  /**
   * Registra un nuevo dispositivo IoT (uso interno/scripts)
   * 
   * - Crea el dispositivo en BD
   * - Genera API key única
   * - Opcionalmente crea sensores iniciales
   * 
   * @returns device_uuid y api_key (la key solo se muestra una vez)
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
   * Provisiona un dispositivo IoT (para Flutter)
   * 
   * Flutter envía: name, model, provisioning_code (del QR de fábrica)
   * Backend: valida código, crea dispositivo, genera API key (NO la devuelve)
   * 
   * @returns device_id, device_uuid, status=PENDING_ACTIVATION
   */
  @Post('provision')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async provisionDevice(
    @Body() dto: ProvisionDeviceDto,
  ): Promise<ProvisionDeviceResponseDto> {
    return this.provisioningService.provisionDevice(dto);
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
