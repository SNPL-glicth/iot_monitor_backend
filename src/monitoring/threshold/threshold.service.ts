import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertThreshold } from '../../entities/alert-threshold.entity';
import { ThresholdHistory } from '../../entities/threshold-history.entity';
import { Sensor } from '../../entities/sensor.entity';
import { ThresholdValidator, ThresholdValidationError } from './threshold-validator';

/**
 * ThresholdService — CRUD de umbrales con historial de cambios.
 *
 * Usa ThresholdValidator (lógica pura, sin DB) para validación de payloads.
 * Usa repositorios inyectados para persistencia.
 */
@Injectable()
export class ThresholdService {
  constructor(
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
    @InjectRepository(ThresholdHistory)
    private readonly thresholdHistoryRepo: Repository<ThresholdHistory>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    private readonly validator: ThresholdValidator,
  ) {}

  async getSensorThresholds(sensorId: number) {
    const rows = await this.thresholdRepo.find({
      where: { sensorId: String(sensorId), isActive: true },
      order: { severity: 'DESC', id: 'ASC' },
    });
    return rows.map((t) => ({
      id: t.id,
      sensorId: t.sensorId,
      name: t.name,
      conditionType: t.conditionType,
      thresholdValueMin: t.thresholdValueMin,
      thresholdValueMax: t.thresholdValueMax,
      severity: t.severity,
      isActive: t.isActive,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async createSensorThreshold(
    sensorId: number,
    body: {
      name: string;
      conditionType: 'greater_than' | 'less_than' | 'equal_to' | 'out_of_range';
      thresholdValueMin?: number | null;
      thresholdValueMax?: number | null;
      severity?: 'info' | 'warning' | 'critical';
    },
  ) {
    const existing = await this.thresholdRepo.findOne({
      where: { sensorId: String(sensorId), isActive: true },
    });

    if (existing) {
      throw new ConflictException(
        'Este sensor ya tiene un límite activo. Edita el existente en lugar de crear uno nuevo.',
      );
    }

    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
    });
    if (!sensor) {
      throw new NotFoundException('Sensor no existe');
    }

    try {
      const validated = this.validator.validate({
        sensorType: sensor.sensorType,
        unit: sensor.unit,
        conditionType: body.conditionType,
        thresholdValueMin: body.thresholdValueMin,
        thresholdValueMax: body.thresholdValueMax,
      });

      const t = this.thresholdRepo.create({
        sensorId: String(sensorId),
        name: body.name,
        conditionType: validated.conditionType as any,
        thresholdValueMin: validated.min === null ? null : String(validated.min),
        thresholdValueMax: validated.max === null ? null : String(validated.max),
        severity: body.severity ?? 'warning',
        isActive: true,
        createdAt: new Date(),
        updatedAt: null,
      });

      const saved = await this.thresholdRepo.save(t);
      return {
        id: saved.id,
        sensorId: saved.sensorId,
        name: saved.name,
        conditionType: saved.conditionType,
        thresholdValueMin: saved.thresholdValueMin,
        thresholdValueMax: saved.thresholdValueMax,
        severity: saved.severity,
        isActive: saved.isActive,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    } catch (e) {
      if (e instanceof ThresholdValidationError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  async updateThreshold(
    thresholdId: number,
    changedByUserId: string,
    body: {
      thresholdValueMin?: number | null;
      thresholdValueMax?: number | null;
      severity?: 'info' | 'warning' | 'critical';
      name?: string;
      reason?: string | null;
    },
  ) {
    const t = await this.thresholdRepo.findOne({
      where: { id: String(thresholdId) },
    });
    if (!t) {
      throw new NotFoundException('Límite no existe');
    }

    const sensor = await this.sensorRepo.findOne({
      where: { id: String(t.sensorId) },
    });
    if (!sensor) {
      throw new NotFoundException('Sensor no existe');
    }

    const oldMin = t.thresholdValueMin ?? null;
    const oldMax = t.thresholdValueMax ?? null;

    const proposedMin =
      body.thresholdValueMin === undefined ? oldMin : body.thresholdValueMin;
    const proposedMax =
      body.thresholdValueMax === undefined ? oldMax : body.thresholdValueMax;

    try {
      const validated = this.validator.validate({
        sensorType: sensor.sensorType,
        unit: sensor.unit,
        conditionType: t.conditionType,
        thresholdValueMin: proposedMin,
        thresholdValueMax: proposedMax,
      });

      const newMin = validated.min === null ? null : String(validated.min);
      const newMax = validated.max === null ? null : String(validated.max);

      const h = this.thresholdHistoryRepo.create({
        thresholdId: t.id,
        oldMin,
        oldMax,
        newMin,
        newMax,
        changedBy: changedByUserId,
        changedAt: new Date(),
        reason: body.reason ?? null,
      });
      await this.thresholdHistoryRepo.save(h);

      if (body.name !== undefined) t.name = body.name;
      if (body.severity !== undefined) t.severity = body.severity;
      t.thresholdValueMin = newMin;
      t.thresholdValueMax = newMax;
      t.updatedAt = new Date();

      const saved = await this.thresholdRepo.save(t);
      return {
        id: saved.id,
        sensorId: saved.sensorId,
        name: saved.name,
        conditionType: saved.conditionType,
        thresholdValueMin: saved.thresholdValueMin,
        thresholdValueMax: saved.thresholdValueMax,
        severity: saved.severity,
        isActive: saved.isActive,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    } catch (e) {
      if (e instanceof ThresholdValidationError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  async deactivateThreshold(
    thresholdId: number,
    changedByUserId: string,
    reason?: string | null,
  ) {
    const t = await this.thresholdRepo.findOne({
      where: { id: String(thresholdId) },
    });
    if (!t) {
      throw new NotFoundException('Límite no existe');
    }

    const h = this.thresholdHistoryRepo.create({
      thresholdId: t.id,
      oldMin: t.thresholdValueMin ?? null,
      oldMax: t.thresholdValueMax ?? null,
      newMin: t.thresholdValueMin ?? null,
      newMax: t.thresholdValueMax ?? null,
      changedBy: changedByUserId,
      changedAt: new Date(),
      reason: reason ?? 'deactivated',
    });
    await this.thresholdHistoryRepo.save(h);

    t.isActive = false;
    t.updatedAt = new Date();
    const saved = await this.thresholdRepo.save(t);
    return { success: true, id: saved.id, isActive: saved.isActive };
  }

  async getThresholdHistory(thresholdId: number) {
    const rows = await this.thresholdHistoryRepo.find({
      where: { thresholdId: String(thresholdId) },
      order: { changedAt: 'DESC' },
    });

    return rows.map((h) => ({
      id: h.id,
      thresholdId: h.thresholdId,
      oldMin: h.oldMin,
      oldMax: h.oldMax,
      newMin: h.newMin,
      newMax: h.newMax,
      changedBy: h.changedBy,
      changedAt: h.changedAt ? h.changedAt.toISOString() : '-',
      reason: h.reason,
    }));
  }

  async getSensorThresholdsCanonical(sensorId: number) {
    return this.getSensorThresholds(sensorId);
  }

  async getSensorThresholdProfile(sensorId: number) {
    const thresholds = await this.getSensorThresholds(sensorId);

    const warning = thresholds.find((t) => t.severity === 'warning');
    const alert = thresholds.find((t) => t.severity === 'critical');

    return {
      sensorId,
      warningMin: warning?.thresholdValueMin ?? null,
      warningMax: warning?.thresholdValueMax ?? null,
      alertMin: alert?.thresholdValueMin ?? null,
      alertMax: alert?.thresholdValueMax ?? null,
      cooldownSeconds: 300, // default
    };
  }

  async upsertSensorThresholdProfile(
    sensorId: number,
    body: {
      warningMin?: number | null;
      warningMax?: number | null;
      alertMin?: number | null;
      alertMax?: number | null;
      cooldownSeconds?: number;
    },
  ) {
    const sensor = await this.sensorRepo.findOne({
      where: { id: String(sensorId) },
    });
    if (!sensor) {
      throw new NotFoundException('Sensor no encontrado');
    }

    const existingThresholds = await this.thresholdRepo.find({
      where: { sensor: { id: String(sensorId) } },
    });

    const warningThreshold = existingThresholds.find(
      (t) => t.severity === 'warning',
    );
    const criticalThreshold = existingThresholds.find(
      (t) => t.severity === 'critical',
    );

    if (body.warningMin !== undefined || body.warningMax !== undefined) {
      if (warningThreshold) {
        warningThreshold.thresholdValueMin =
          body.warningMin?.toString() ?? null;
        warningThreshold.thresholdValueMax =
          body.warningMax?.toString() ?? null;
        await this.thresholdRepo.save(warningThreshold);
      } else if (body.warningMin !== null || body.warningMax !== null) {
        const newWarning = this.thresholdRepo.create({
          sensor,
          name: 'Warning Level',
          conditionType: 'out_of_range',
          thresholdValueMin: body.warningMin?.toString() ?? null,
          thresholdValueMax: body.warningMax?.toString() ?? null,
          severity: 'warning',
          isActive: true,
        });
        await this.thresholdRepo.save(newWarning);
      }
    }

    if (body.alertMin !== undefined || body.alertMax !== undefined) {
      if (criticalThreshold) {
        criticalThreshold.thresholdValueMin =
          body.alertMin?.toString() ?? null;
        criticalThreshold.thresholdValueMax =
          body.alertMax?.toString() ?? null;
        await this.thresholdRepo.save(criticalThreshold);
      } else if (body.alertMin !== null || body.alertMax !== null) {
        const newCritical = this.thresholdRepo.create({
          sensor,
          name: 'Alert Level',
          conditionType: 'out_of_range',
          thresholdValueMin: body.alertMin?.toString() ?? null,
          thresholdValueMax: body.alertMax?.toString() ?? null,
          severity: 'critical',
          isActive: true,
        });
        await this.thresholdRepo.save(newCritical);
      }
    }

    return this.getSensorThresholdProfile(sensorId);
  }
}
