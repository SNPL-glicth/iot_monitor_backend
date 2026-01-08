import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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
  DefineSensorDto,
  DefineSensorResponseDto,
  PendingSensorDto,
  PublishSensorDto,
  ReserveSensorResponseDto,
  ConfirmSensorDto,
  ConfirmSensorResponseDto,
} from './provisioning.dto';

/**
 * Controller para gestión de dispositivos IoT
 * 
 * FLUJO DISPOSITIVOS:
 * 1. Crear dispositivo -> POST /devices/create -> estado DRAFT
 * 2. Preparar activación -> POST /devices/:uuid/prepare-activation -> estado PENDING_ACTIVATION
 * 3. Firmware activa -> POST /devices/activate -> estado OFFLINE (recibe api_key)
 * 
 * FLUJO SENSORES (DEFINITIVO):
 * 1. Definir sensor -> POST /devices/:uuid/sensors/define -> estado DRAFT
 * 2. Publicar sensor -> POST /devices/sensors/:uuid/publish -> estado PENDING_CLAIM
 * 3. Reservar sensor -> POST /devices/sensors/:uuid/reserve -> estado PENDING_CONFIRMATION
 * 4. Confirmar sensor -> POST /devices/sensors/confirm -> estado ONLINE (recibe api_key)
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
   * Legacy: Agrega un sensor completo (para compatibilidad)
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
   * PASO 1 SENSOR: Definir sensor (solo métricas, sin crear físicamente)
   * - Solo tipo, unidad, umbrales
   * - Estado: DRAFT
   * - SIN nombre (viene del QR después)
   */
  @Post(':deviceUuid/sensors/define')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async defineSensor(
    @Param('deviceUuid') deviceUuid: string,
    @Body() dto: DefineSensorDto,
  ): Promise<DefineSensorResponseDto> {
    return this.provisioningService.defineSensor(deviceUuid, dto);
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

  // ══════════════════════════════════════════════════════════════════════════
  // FLUJO DEFINITIVO: PUBLISH → RESERVE → CONFIRM
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * PASO 2: Publicar sensor (hacerlo disponible para claim)
   * Estado: DRAFT → PENDING_CLAIM
   */
  @Post('sensors/:sensorUuid/publish')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async publishSensor(
    @Param('sensorUuid') sensorUuid: string,
    @Body() dto: PublishSensorDto,
  ): Promise<{ sensorUuid: string; status: string; message: string }> {
    return this.provisioningService.publishSensor(sensorUuid, dto.requireQrConfirmation);
  }

  /**
   * Lista sensores disponibles para claim (PENDING_CLAIM)
   * Puede ser filtrado por tipo de sensor
   */
  @Get('sensors/claimable')
  @Roles('admin', 'operator')
  @HttpCode(HttpStatus.OK)
  async getClaimableSensors(): Promise<PendingSensorDto[]> {
    return this.provisioningService.getClaimableSensors();
  }

  /**
   * PASO 3: Reservar sensor (instalador selecciona)
   * Estado: PENDING_CLAIM → PENDING_CONFIRMATION
   */
  @Post('sensors/:sensorUuid/reserve')
  @Roles('admin', 'operator')
  @HttpCode(HttpStatus.OK)
  async reserveSensor(
    @Param('sensorUuid') sensorUuid: string,
    @Req() req: Request,
  ): Promise<ReserveSensorResponseDto> {
    const userId = String((req as any).user?.userId ?? (req as any).user?.sub ?? (req as any).user?.id ?? '');
    return this.provisioningService.reserveSensor(sensorUuid, userId);
  }

  /**
   * Elimina un dispositivo (soft delete)
   * Solo permite eliminar dispositivos en estado: draft, pending_activation, offline
   * o que no tengan sensores activos online
   */
  @Delete(':deviceId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deleteDevice(
    @Param('deviceId') deviceId: string,
  ): Promise<{ message: string }> {
    return this.provisioningService.deleteDevice(deviceId);
  }

  /**
   * Elimina un sensor (soft delete)
   * Solo permite eliminar sensores en estado: draft, pending_claim, pending_confirmation o inactivos
   */
  @Delete('sensors/:sensorId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deleteSensor(
    @Param('sensorId') sensorId: string,
  ): Promise<{ message: string }> {
    return this.provisioningService.deleteSensor(sensorId);
  }

  /**
   * Actualiza datos básicos de un sensor (nombre)
   */
  @Patch('sensors/:sensorId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async updateSensor(
    @Param('sensorId') sensorId: string,
    @Body() body: { name?: string },
  ): Promise<{ message: string }> {
    return this.provisioningService.updateSensor(sensorId, body);
  }
}

/**
 * Controller para activación de dispositivos (FIRMWARE/INSTALADOR)
 * Endpoints públicos o con auth mínima
 */
@Controller('devices')
export class DeviceActivationController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  /**
   * Activa un dispositivo IoT (llamado por FIRMWARE)
   *  NO requiere autenticación JWT
   * 
   * Rate limiting:
   * - Máx 5 intentos por provisioning_code
   * - Cooldown de 1 minuto entre intentos
   * - IP registrada para auditoría
   */
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activateDevice(
    @Body() dto: ActivateDeviceDto,
    @Req() req: Request,
  ): Promise<ActivateDeviceResponseDto> {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] 
      || req.socket?.remoteAddress 
      || 'unknown';
    return this.provisioningService.activateDevice(dto, clientIp);
  }

  /**
   * PASO 4: Confirmar activación del sensor
   * Estado: PENDING_CONFIRMATION → ONLINE
   * 
   *  AUTH IMPLÍCITA por claim_token de un solo uso
   * 
   * Seguridad:
   * - Token debe existir y no estar expirado
   * - Token se invalida después de uso exitoso
   * - Rate limiting: máx 3 intentos, 1 por minuto
   * - IP del cliente registrada para auditoría
   * 
   * En éxito devuelve:
   * - Datos del sensor activado
   * - API Key del sensor ( SOLO SE MUESTRA UNA VEZ)
   * 
   *  NO acepta nombre - el admin lo asigna después
   */
  @Post('sensors/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmSensor(
    @Body() dto: ConfirmSensorDto,
    @Req() req: Request,
  ): Promise<ConfirmSensorResponseDto> {
    // Obtener IP del cliente para auditoría y rate limiting
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] 
      || req.socket?.remoteAddress 
      || 'unknown';
    
    return this.provisioningService.confirmSensor(dto, clientIp);
  }
}
