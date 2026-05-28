import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from '../../entities/sensor.entity';
import { SensorReading } from '../../entities/sensor-reading.entity';
import { LatestSensorReadingView, SensorConsolidatedStatusView } from '../../entities/views';

@Injectable()
export class SensorDebugCoreService {
  constructor(
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(SensorReading)
    private readonly sensorReadingRepo: Repository<SensorReading>,
    @InjectRepository(LatestSensorReadingView)
    private readonly latestSensorReadingViewRepo: Repository<LatestSensorReadingView>,
    @InjectRepository(SensorConsolidatedStatusView)
    private readonly sensorConsolidatedStatusViewRepo: Repository<SensorConsolidatedStatusView>,
  ) {}

  async debugSensor(sensorId: number) {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
      relations: ['device'],
    });

    if (!sensor) {
      return {
        found: false,
        message: 'Sensor no encontrado en la tabla sensors',
      };
    }

    const readingsCount = await this.sensorReadingRepo.count({
      where: { sensor: { id: String(sensorId) } },
    });

    const inLatestReadingsView = await this.latestSensorReadingViewRepo.findOne({
      where: { sensorId: String(sensorId) },
    });

    const inConsolidatedView = await this.sensorConsolidatedStatusViewRepo.findOne({
      where: { sensorId: String(sensorId) },
    });

    const blockers = {
      isActive: !sensor.isActive,
      isInitializing: sensor.operationalState === 'INITIALIZING',
      isRevoked: sensor.status === 'revoked',
      isDraft: sensor.status === 'draft',
      deviceDeleted: sensor.device?.deletedAt !== null && sensor.device?.deletedAt !== undefined,
      noReadings: readingsCount === 0,
    };

    const isBlocked = Object.values(blockers).some((b) => b);

    return {
      found: true,
      sensor: {
        id: sensor.id,
        name: sensor.name,
        isActive: sensor.isActive,
        status: sensor.status,
        operationalState: sensor.operationalState,
        validReadingsCount: sensor.validReadingsCount,
        minReadingsForNormal: sensor.minReadingsForNormal,
        deviceId: sensor.device?.id,
        deviceStatus: sensor.device?.status,
      },
      readingsCount,
      visibleInViews: {
        latestReadings: !!inLatestReadingsView,
        consolidated: !!inConsolidatedView,
      },
      blockers,
      isBlocked,
      diagnosis: this.generateDiagnosis(blockers, sensor, readingsCount),
    };
  }

  private generateDiagnosis(
    blockers: Record<string, boolean>,
    sensor: Sensor,
    readingsCount: number,
  ): string {
    const reasons: string[] = [];

    if (blockers.isActive) {
      reasons.push('is_active=false -> filtrado por vistas SQL');
    }
    if (blockers.isInitializing) {
      const progress = `${sensor.validReadingsCount}/${sensor.minReadingsForNormal}`;
      reasons.push(`operational_state=INITIALIZING -> necesita ${progress} lecturas validas`);
    }
    if (blockers.isRevoked) {
      reasons.push('status=revoked -> sensor desactivado permanentemente');
    }
    if (blockers.isDraft) {
      reasons.push('status=draft -> sensor no activado aun');
    }
    if (blockers.noReadings) {
      reasons.push('Sin lecturas en sensor_readings -> no hay datos para mostrar');
    }

    if (reasons.length === 0) {
      return 'Sensor deberia ser visible. Si no aparece en Flutter, verificar cache.';
    }

    return reasons.join('\n');
  }
}
