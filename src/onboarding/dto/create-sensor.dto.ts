import { IsUUID, IsString, MinLength, MaxLength, IsInt, Min, Max, IsIn } from 'class-validator';

export class CreateSensorDto {
  @IsUUID()
  deviceUuid!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sensorName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  sensorType!: string;

  @IsInt()
  @Min(100)
  @Max(60000)
  samplingIntervalMs!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @IsIn([0, 1, 2])
  qos!: number;
}
