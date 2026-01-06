import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

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
  provisioningCode?: string;

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
