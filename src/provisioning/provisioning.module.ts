import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProvisioningController, DeviceActivationController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';
import { DeviceProvisioningService } from './device-provisioning.service';
import { SensorProvisioningService } from './sensor-provisioning.service';
import { Device } from '../entities/device.entity';
import { Sensor } from '../entities/sensor.entity';
import { DeviceApiKey } from '../entities/device-api-key.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, Sensor, DeviceApiKey]),
  ],
  controllers: [ProvisioningController, DeviceActivationController],
  providers: [ProvisioningService, DeviceProvisioningService, SensorProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
