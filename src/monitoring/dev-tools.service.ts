import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sensor } from '../entities/sensor.entity';

/**
 * Servicio de utilidades para desarrollo/testing.
 * SOLID-SRP: Operaciones destructivas de datos, aisladas del dominio principal.
 * En producción estos endpoints deberían estar deshabilitados o protegidos.
 */
@Injectable()
export class DevToolsService {
  private readonly logger = new Logger(DevToolsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
  ) {}

  async deleteAllSensorReadings(userId: string): Promise<{
    success: boolean;
    deletedCount: number;
    executedBy: string;
    executedAt: string;
    warning: string;
  }> {
    this.logger.warn(`[DEV-TOOLS] User ${userId} is deleting ALL sensor readings`);

    try {
      const countResult = await this.dataSource.query(
        'SELECT COUNT(*) as total FROM sensor_readings',
      );
      const totalBefore = Number(countResult[0]?.total ?? 0);

      await this.dataSource.query('DELETE FROM predictions');
      await this.dataSource.query('DELETE FROM ml_events');
      await this.dataSource.query('DELETE FROM ml_watermarks');
      await this.dataSource.query('DELETE FROM sensor_readings');

      this.logger.warn(`[DEV-TOOLS] Deleted ${totalBefore} sensor readings by user ${userId}`);

      return {
        success: true,
        deletedCount: totalBefore,
        executedBy: userId,
        executedAt: new Date().toISOString(),
        warning:
          '⚠️ Todas las lecturas de sensores han sido eliminadas. Esta acción es irreversible.',
      };
    } catch (error) {
      this.logger.error(
        `[DEV-TOOLS] Error deleting sensor readings: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        `Error al eliminar lecturas: ${(error as Error).message}`,
      );
    }
  }

  async deleteSensorReadingsBySensor(
    sensorId: number,
    userId: string,
  ): Promise<{
    success: boolean;
    sensorId: number;
    deletedCount: number;
    executedBy: string;
    executedAt: string;
  }> {
    this.logger.warn(
      `[DEV-TOOLS] User ${userId} is deleting readings for sensor ${sensorId}`,
    );

    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
    });
    if (!sensor) {
      throw new NotFoundException(`Sensor ${sensorId} no encontrado`);
    }

    try {
      const countResult = await this.dataSource.query(
        'SELECT COUNT(*) as total FROM sensor_readings WHERE sensor_id = @0',
        [sensorId],
      );
      const totalBefore = Number(countResult[0]?.total ?? 0);

      await this.dataSource.query(
        'DELETE FROM predictions WHERE sensor_id = @0',
        [sensorId],
      );
      await this.dataSource.query(
        'DELETE FROM ml_events WHERE sensor_id = @0',
        [sensorId],
      );
      await this.dataSource.query(
        'DELETE FROM ml_watermarks WHERE sensor_id = @0',
        [sensorId],
      );
      await this.dataSource.query(
        'DELETE FROM sensor_readings WHERE sensor_id = @0',
        [sensorId],
      );

      this.logger.warn(
        `[DEV-TOOLS] Deleted ${totalBefore} readings for sensor ${sensorId} by user ${userId}`,
      );

      return {
        success: true,
        sensorId,
        deletedCount: totalBefore,
        executedBy: userId,
        executedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `[DEV-TOOLS] Error deleting readings for sensor ${sensorId}: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        `Error al eliminar lecturas del sensor ${sensorId}: ${(error as Error).message}`,
      );
    }
  }
}
