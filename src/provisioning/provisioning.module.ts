import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';
import { Device } from '../entities/device.entity';
import { Sensor } from '../entities/sensor.entity';
import { DeviceApiKey } from '../entities/device-api-key.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, Sensor, DeviceApiKey]),
  ],
  controllers: [ProvisioningController],
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
