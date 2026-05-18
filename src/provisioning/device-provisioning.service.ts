import { Injectable } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';

@Injectable()
export class DeviceProvisioningService {
  constructor(private readonly provisioning: ProvisioningService) {}

  async registerDevice(dto: any) { return this.provisioning.registerDevice(dto); }
  async createDevice(dto: any) { return this.provisioning.createDevice(dto); }
  async prepareActivation(deviceUuid: string) { return this.provisioning.prepareActivation(deviceUuid); }
  async activateDevice(dto: any, clientIp?: string) { return this.provisioning.activateDevice(dto, clientIp); }
  async rotateApiKey(deviceUuid: string) { return this.provisioning.rotateApiKey(deviceUuid); }
  async revokeAllKeys(deviceUuid: string) { return this.provisioning.revokeAllKeys(deviceUuid); }
  async deleteDevice(deviceId: string) { return this.provisioning.deleteDevice(deviceId); }
}
