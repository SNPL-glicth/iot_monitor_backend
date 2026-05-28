import { IsNumber, IsOptional, IsString, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateThresholdProfileDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  warningMin?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  warningMax?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  alertMin?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  alertMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(86400)
  @Type(() => Number)
  cooldownSeconds?: number;
}

export class CreateSensorThresholdDto {
  @IsString()
  name!: string;

  @IsIn(['greater_than', 'less_than', 'equal_to', 'out_of_range'])
  conditionType!: 'greater_than' | 'less_than' | 'equal_to' | 'out_of_range';

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  thresholdValueMin?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  thresholdValueMax?: number;

  @IsIn(['warning', 'critical', 'info'])
  severity!: 'warning' | 'critical' | 'info';
}

export class UpdateThresholdDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  thresholdValueMin?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  thresholdValueMax?: number;

  @IsOptional()
  @IsIn(['warning', 'critical', 'info'])
  severity?: 'warning' | 'critical' | 'info';

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  reason?: string | null;
}
