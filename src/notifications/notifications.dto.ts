import { IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  fcmToken!: string;

  @IsString()
  platform!: string; // 'android' | 'ios' | 'web'
}

export type MlSeverity = 'info' | 'warning' | 'critical';

export interface AlertPushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}
