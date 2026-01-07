import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class SensorDefinitionDto {
  @IsString()
  @IsNotEmpty()
  sensorType!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  unit!: string;
}

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  deviceType!: string;

  @IsOptional()
  @IsArray()
  sensors?: SensorDefinitionDto[];

  @IsOptional()
  @IsString()
  metadata?: string;
}

export class RegisterDeviceResponseDto {
  deviceUuid!: string;
  deviceId!: string;
  deviceApiKey!: string;
  sensors!: {
    sensorUuid: string;
    sensorId: string;
    name: string;
    sensorType: string;
    unit: string;
  }[];
  message!: string;
}

/**
 * PASO 1: Definir sensor (lógico, sin crear físicamente)
 * Solo tipo, unidad y umbrales. Nombre viene del QR después.
 */
export class DefineSensorDto {
  @IsString()
  @IsNotEmpty()
  sensorType!: string;

  @IsString()
  @IsNotEmpty()
  unit!: string;

  @IsOptional()
  warningMin?: number;

  @IsOptional()
  warningMax?: number;

  @IsOptional()
  alertMin?: number;

  @IsOptional()
  alertMax?: number;
}

export class DefineSensorResponseDto {
  sensorUuid!: string;
  sensorId!: string;
  sensorType!: string;
  unit!: string;
  status!: string;
  thresholds?: {
    warningMin?: number;
    warningMax?: number;
    alertMin?: number;
    alertMax?: number;
  };
  message!: string;
}

/**
 * Legacy: AddSensorDto (para compatibilidad)
 */
export class AddSensorDto {
  @IsString()
  @IsNotEmpty()
  sensorType!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  unit!: string;

  @IsOptional()
  warningMin?: number;

  @IsOptional()
  warningMax?: number;

  @IsOptional()
  alertMin?: number;

  @IsOptional()
  alertMax?: number;
}

export class AddSensorResponseDto {
  sensorUuid!: string;
  sensorId!: string;
  name!: string;
  sensorType!: string;
  unit!: string;
  thresholds?: {
    warningMin?: number;
    warningMax?: number;
    alertMin?: number;
    alertMax?: number;
  };
}

export class ProvisionDeviceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  metadata?: string;
}

export class ProvisionDeviceResponseDto {
  deviceId!: string;
  deviceUuid!: string;
  status!: string;
  message!: string;
}

export class ActivateDeviceDto {
  @IsString()
  @IsNotEmpty()
  provisioningCode!: string;

  @IsOptional()
  @IsString()
  firmwareVersion?: string;
}

export class ActivateDeviceResponseDto {
  deviceUuid!: string;
  deviceApiKey!: string;
  ingestUrl!: string;
  sensors!: {
    sensorUuid: string;
    sensorType: string;
    name: string;
    unit: string;
  }[];
}

export class RotateApiKeyResponseDto {
  deviceUuid!: string;
  newApiKey!: string;
  message!: string;
}

// ══════════════════════════════════════════════════════════════════════════
// FLUJO DEFINITIVO: PUBLISH → RESERVE → CONFIRM
// Estados: DRAFT → PENDING_CLAIM → PENDING_CONFIRMATION → ONLINE
// ══════════════════════════════════════════════════════════════════════════

/**
 * Sensor pendiente de claim (para instalador)
 */
export class PendingSensorDto {
  sensorUuid!: string;
  sensorType!: string;
  unit!: string;
  deviceUuid!: string;
  deviceName!: string;
  status!: string;
  createdAt!: string;
}

/**
 * DTO para publicar un sensor (hacerlo disponible para claim)
 */
export class PublishSensorDto {
  @IsOptional()
  @IsBoolean()
  requireQrConfirmation?: boolean;
}

/**
 * Respuesta al reservar un sensor
 */
export class ReserveSensorResponseDto {
  sensorUuid!: string;
  sensorType!: string;
  unit!: string;
  deviceName!: string;
  claimToken!: string;
  claimTokenExpires!: string;
  requireQrConfirmation!: boolean;
  qrData?: string; // Solo si requireQrConfirmation = true
  message!: string;
}

/**
 * DTO para confirmar activación
 * 
 * ⚠️ Auth implícita por claim_token de un solo uso
 * - Token debe existir y no estar expirado
 * - Token se invalida después de uso (exitoso o fallido tras X intentos)
 * - Rate limiting por IP y por token
 * 
 * 🚫 NO acepta sensorName - el nombre lo asigna el admin
 */
export class ConfirmSensorDto {
  @IsString()
  @IsNotEmpty()
  claimToken!: string;
}

/**
 * Respuesta al confirmar activación
 * 
 * Incluye:
 * - Datos del sensor activado
 * - API Key del sensor (⚠️ SOLO SE MUESTRA UNA VEZ)
 */
export class ConfirmSensorResponseDto {
  sensorUuid!: string;
  sensorId!: string;
  name!: string;
  sensorType!: string;
  unit!: string;
  deviceUuid!: string;
  deviceName!: string;
  status!: string;
  
  /**
   * API Key del sensor para autenticación en ingesta
   * ⚠️ SOLO SE MUESTRA UNA VEZ - guardar de forma segura
   */
  sensorApiKey!: string;
  
  /**
   * Prefijo del API Key para identificación futura
   */
  apiKeyPrefix!: string;
  
  message!: string;
}
