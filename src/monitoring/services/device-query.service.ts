import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../../entities/device.entity';
import { DeviceWithSensorsView } from '../../entities/views';
import { formatDateTime } from '../../shared/date-format.util';

/**
 * DeviceQueryService — Lectura de dispositivos y vistas asociadas.
 *
 * SOLID-SRP: Solo lectura. Sin mutación de estado.
 */
@Injectable()
export class DeviceQueryService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(DeviceWithSensorsView)
    private readonly deviceWithSensorsViewRepo: Repository<DeviceWithSensorsView>,
  ) {}

  /**
   * Lista dispositivos con sus sensores (vista v_devices_with_sensors)
   */
  async getDevicesWithSensors() {
    const rows = await this.deviceWithSensorsViewRepo.find();
    return rows.map((row) => ({
      ...row,
      lastConnection: formatDateTime(row.lastConnection ?? null),
    }));
  }

  async getDeviceById(id: number) {
    return this.deviceRepo.findOne({ where: { id: String(id) } });
  }
}
