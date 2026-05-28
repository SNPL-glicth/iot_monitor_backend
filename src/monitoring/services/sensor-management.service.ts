import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Sensor } from '../../entities/sensor.entity';
import { withTransaction } from '../../common/utils/transaction.utils';

@Injectable()
export class SensorManagementService {
  constructor(private readonly dataSource: DataSource) {}

  async deleteSensor(sensorId: number) {
    return withTransaction(this.dataSource, async (manager) => {
      const sensor = await manager.findOne(Sensor, {
        where: { id: String(sensorId) },
        relations: ['device'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!sensor) {
        throw new NotFoundException('Sensor no encontrado');
      }

      const sensorStatus = (sensor.status || '').toLowerCase();
      const deviceStatus = (sensor.device?.status || '').toLowerCase();
      const deletableStates = ['draft', 'pending_claim', 'pending_confirmation', 'revoked'];

      const canDelete =
        deletableStates.includes(sensorStatus) ||
        !sensor.isActive ||
        deviceStatus !== 'online';

      if (!canDelete) {
        throw new BadRequestException(
          `No se puede eliminar un sensor en estado "${sensor.status}" mientras el dispositivo esta online. ` +
          'Desactive el sensor primero o espere a que el dispositivo este offline.',
        );
      }

      sensor.isActive = false;
      sensor.status = 'revoked';
      sensor.updatedAt = new Date();
      await manager.save(sensor);

      return {
        message: `Sensor ${sensor.name || sensorId} eliminado correctamente.`,
      };
    });
  }
}
