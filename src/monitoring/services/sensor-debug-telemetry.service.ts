import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorReading } from '../../entities/sensor-reading.entity';
import { Sensor } from '../../entities/sensor.entity';
import { ActiveAlertView } from '../../entities/views';

@Injectable()
export class SensorDebugTelemetryService {
  constructor(
    @InjectRepository(SensorReading)
    private readonly sensorReadingRepo: Repository<SensorReading>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(ActiveAlertView)
    private readonly activeAlertViewRepo: Repository<ActiveAlertView>,
  ) {}

  async debugTelemetryFlow(sensorId?: number) {
    const logs: string[] = [];
    const now = new Date();

    try {
      const totalReadings = await this.sensorReadingRepo.count();
      logs.push(`Total readings in DB: ${totalReadings}`);

      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const recentCount = await this.sensorReadingRepo
        .createQueryBuilder('r')
        .where('r.timestamp >= :since', { since: oneHourAgo })
        .getCount();
      logs.push(`Readings last hour: ${recentCount}`);

      const lastReading = await this.sensorReadingRepo
        .createQueryBuilder('r')
        .orderBy('r.timestamp', 'DESC')
        .getOne();

      if (lastReading) {
        const lastTs = lastReading.timestamp instanceof Date
          ? lastReading.timestamp
          : new Date(lastReading.timestamp);
        const ageMinutes = Math.round((now.getTime() - lastTs.getTime()) / 60000);
        logs.push(`Last reading age: ${ageMinutes} minutes ago`);
        logs.push(`Last reading: sensor=${lastReading.sensorId}, value=${lastReading.value}`);
      } else {
        logs.push('NO READINGS FOUND IN DATABASE');
      }

      let sensorSample: any = null;
      if (sensorId) {
        const sensor = await this.sensorRepo.findOne({
          where: { id: String(sensorId) },
          relations: ['device'],
        });

        if (sensor) {
          logs.push(`SENSOR ${sensorId} DETAILS:`);
          logs.push(`   Name: ${sensor.name}`);
          logs.push(`   Device: ${sensor.device?.name ?? 'N/A'}`);
          logs.push(`   Unit: ${sensor.unit}`);
          logs.push(`   Active: ${sensor.isActive}`);

          const sensorReadings = await this.sensorReadingRepo
            .createQueryBuilder('r')
            .where('r.sensor_id = :sensorId', { sensorId: String(sensorId) })
            .orderBy('r.timestamp', 'DESC')
            .take(5)
            .getMany();

          logs.push(`   Recent readings: ${sensorReadings.length}`);

          if (sensorReadings.length > 0) {
            sensorSample = {
              count: sensorReadings.length,
              latest: {
                timestamp: sensorReadings[0].timestamp,
                value: Number(sensorReadings[0].value),
              },
              oldest: {
                timestamp: sensorReadings[sensorReadings.length - 1].timestamp,
                value: Number(sensorReadings[sensorReadings.length - 1].value),
              },
            };

            const timestamps = sensorReadings.map((r) =>
              r.timestamp instanceof Date ? r.timestamp.getTime() : new Date(r.timestamp).getTime()
            );
            const uniqueTs = new Set(timestamps);
            if (uniqueTs.size < timestamps.length) {
              logs.push(`   WARNING: ${timestamps.length - uniqueTs.size} duplicate timestamps detected!`);
            }
          }
        } else {
          logs.push(`Sensor ${sensorId} NOT FOUND`);
        }
      }

      const activeAlerts = await this.activeAlertViewRepo.count();
      logs.push(`Active alerts: ${activeAlerts}`);

      const streamHealth = recentCount > 0 ? 'ACTIVE' : 'DEAD';
      logs.push(`Stream health: ${streamHealth}`);

      return {
        timestamp: now.toISOString(),
        status: recentCount > 0 ? 'OK' : 'NO_RECENT_DATA',
        logs,
        sensorSample,
        summary: {
          totalReadings,
          recentCount,
          activeAlerts,
          streamHealth,
        },
      };
    } catch (e) {
      logs.push(`ERROR: ${(e as Error).message}`);
      return {
        timestamp: now.toISOString(),
        status: 'ERROR',
        logs,
        error: (e as Error).message,
      };
    }
  }
}
