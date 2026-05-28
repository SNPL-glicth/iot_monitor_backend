import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorConsolidatedStatusView } from '../../entities/views';
import { withDeadlockRetry } from '../../shared/deadlock-retry.util';
import { formatDateTime } from '../../shared/date-format.util';
import { SensorStatusCoreService } from './sensor-status-core.service';

@Injectable()
export class SensorStatusBatchService {
  private static readonly MAX_BATCH_SIZE = 100;
  private static readonly MAX_INPUT_LENGTH = 1000;

  constructor(
    @InjectRepository(SensorConsolidatedStatusView)
    private readonly sensorConsolidatedStatusViewRepo: Repository<SensorConsolidatedStatusView>,
    private readonly sensorStatusCoreService: SensorStatusCoreService,
  ) {}

  async getAllSensorsConsolidatedStatus() {
    try {
      const rows = await withDeadlockRetry(() =>
        this.sensorConsolidatedStatusViewRepo.find()
      );
      return rows.map((row) => ({
        ...row,
        latestTimestamp: formatDateTime(row.latestTimestamp ?? null),
        alertTriggeredAt: formatDateTime(row.alertTriggeredAt ?? null),
        warningCreatedAt: formatDateTime(row.warningCreatedAt ?? null),
      }));
    } catch (e) {
      const msg = String((e as Error)?.message ?? '');
      if (msg.includes('No metadata') || msg.includes('Invalid object name')) {
        return [];
      }
      throw e;
    }
  }

  async getSensorConsolidatedStatusBatch(idsRaw: string) {
    if (!idsRaw || typeof idsRaw !== 'string') return [];
    if (idsRaw.length > SensorStatusBatchService.MAX_INPUT_LENGTH) {
      throw new BadRequestException(
        `Input too long: max ${SensorStatusBatchService.MAX_INPUT_LENGTH} characters allowed`
      );
    }

    const ids = idsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !isNaN(Number(s)))
      .map(Number);

    if (ids.length === 0) return [];
    if (ids.length > SensorStatusBatchService.MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `Maximo ${SensorStatusBatchService.MAX_BATCH_SIZE} sensores por batch. Recibidos: ${ids.length}`
      );
    }

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return await this.sensorStatusCoreService.getSensorConsolidatedStatus(id);
        } catch {
          return { sensorId: id, error: 'not_found' };
        }
      }),
    );

    return results;
  }
}
