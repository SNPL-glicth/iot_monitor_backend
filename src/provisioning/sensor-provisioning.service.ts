import { Injectable } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';

@Injectable()
export class SensorProvisioningService {
  constructor(private readonly provisioning: ProvisioningService) {}

  async addSensor(deviceUuid: string, dto: any) { return this.provisioning.addSensor(deviceUuid, dto); }
  async defineSensor(deviceUuid: string, dto: any) { return this.provisioning.defineSensor(deviceUuid, dto); }
  async publishSensor(sensorId: string) { return this.provisioning.publishSensor(sensorId); }
  async reserveSensor(sensorId: string, deviceUuid: string) { return this.provisioning.reserveSensor(sensorId, deviceUuid); }
  async confirmSensor(dto: any) { return this.provisioning.confirmSensor(dto); }
  async getClaimableSensors(sensorType?: string) { return this.provisioning.getClaimableSensors(sensorType); }
  async deleteSensor(sensorId: string) { return this.provisioning.deleteSensor(sensorId); }
  async updateSensor(sensorId: string, data: { name?: string }) { return this.provisioning.updateSensor(sensorId, data); }
}
