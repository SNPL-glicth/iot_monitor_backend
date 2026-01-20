import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';

import { MonitoringService } from '../monitoring/monitoring.service';
import { RealtimeGateway } from './realtime.gateway';

function hashJson(value: unknown): string {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

/**
 * FIX DEADLOCK: Detecta si el error es un deadlock de SQL Server (error 1205)
 */
function isDeadlockError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  const code = e.number ?? e.errno ?? e.code ?? '';
  return code === 1205 || code === '1205' || String(e.message ?? '').toLowerCase().includes('deadlock');
}

/**
 * FIX DEADLOCK: Ejecuta una operación con retry exponencial para deadlocks
 */
async function withDeadlockRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 100,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isDeadlockError(e) || attempt >= maxRetries) {
        throw e;
      }
      // Exponential backoff con jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

@Injectable()
export class RealtimePollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimePollerService.name);

  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false; // FIX: Evita ticks concurrentes

  private lastReadingsHash: string | null = null;
  private lastAlertsHash: string | null = null;
  private lastPredictionsHash: string | null = null;
  private lastMlEventsHash: string | null = null;
  private lastConsolidatedHash: string | null = null;

  // FIX: Contador de errores consecutivos para backoff adaptativo
  private consecutiveErrors = 0;
  private static readonly MAX_CONSECUTIVE_ERRORS = 5;

  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit() {
    // FIX: Intervalo mínimo de 5s para evitar polling agresivo
    const intervalMs = Math.max(
      5000,
      Number(process.env.REALTIME_POLL_INTERVAL_MS ?? '5000') || 5000,
    );

    this.logger.log(`Realtime poller enabled intervalMs=${intervalMs}`);

    // First tick immediately, then interval
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    // FIX: Evitar ticks concurrentes que causan deadlocks
    if (this.isTickRunning) {
      this.logger.debug('Skipping tick - previous tick still running');
      return;
    }

    // FIX: Backoff adaptativo si hay muchos errores consecutivos
    if (this.consecutiveErrors >= RealtimePollerService.MAX_CONSECUTIVE_ERRORS) {
      this.logger.warn(
        `Too many consecutive errors (${this.consecutiveErrors}), skipping tick to reduce load`,
      );
      // Resetear contador gradualmente
      this.consecutiveErrors = Math.max(0, this.consecutiveErrors - 1);
      return;
    }

    this.isTickRunning = true;

    try {
      let latestReadings: any[] = [];
      let alerts: any[] = [];
      let predictions: any[] = [];
      let mlEvents: any[] = [];
      let consolidated: any[] = [];

      // FIX DEADLOCK: Ejecutar queries secuencialmente con retry, no en paralelo
      // Esto reduce la contención de locks en la BD
      try {
        latestReadings = await withDeadlockRetry(
          () => this.monitoringService.getLatestSensorReadings(),
        );
      } catch (e) {
        this.logger.warn(`getLatestSensorReadings failed: ${String((e as Error)?.message ?? e)}`);
      }

      try {
        alerts = await withDeadlockRetry(
          () => this.monitoringService.getActiveAlerts(),
        );
      } catch (e) {
        this.logger.warn(`getActiveAlerts failed: ${String((e as Error)?.message ?? e)}`);
      }

      try {
        predictions = await withDeadlockRetry(
          () => this.monitoringService.getLatestPredictions(50),
        );
      } catch (e) {
        this.logger.warn(`getLatestPredictions failed: ${String((e as Error)?.message ?? e)}`);
      }

      try {
        mlEvents = await withDeadlockRetry(
          () => this.monitoringService.getActiveMlEvents(50),
        );
      } catch (e) {
        this.logger.warn(`getActiveMlEvents failed: ${String((e as Error)?.message ?? e)}`);
      }

      // PASO 3: Estado consolidado de sensores (SSOT para frontend)
      // Solo intenta si la vista existe (migración paso3 aplicada)
      try {
        consolidated = await withDeadlockRetry(
          () => this.monitoringService.getAllSensorsConsolidatedStatus(),
        );
      } catch (e) {
        // Silenciar error si la vista no existe (migración pendiente)
        const msg = String((e as Error)?.message ?? e);
        if (!msg.includes('No metadata') && !msg.includes('Invalid object name')) {
          this.logger.warn(`getAllSensorsConsolidatedStatus failed: ${msg}`);
        }
      }

      const readingsHash = hashJson(latestReadings);
      if (this.lastReadingsHash !== readingsHash) {
        this.lastReadingsHash = readingsHash;
        this.gateway.broadcast('readings/latest', latestReadings);
      }

      const alertsHash = hashJson(alerts);
      if (this.lastAlertsHash !== alertsHash) {
        this.lastAlertsHash = alertsHash;
        this.gateway.broadcast('alerts/active', alerts);
      }

      const predHash = hashJson(predictions);
      if (this.lastPredictionsHash !== predHash) {
        this.lastPredictionsHash = predHash;
        this.gateway.broadcast('predictions/latest', predictions);
      }

      const mlEventsHash = hashJson(mlEvents);
      if (this.lastMlEventsHash !== mlEventsHash) {
        this.lastMlEventsHash = mlEventsHash;
        this.gateway.broadcast('ml/events/active', mlEvents);
      }

      // PASO 3: Emitir estado consolidado de sensores
      const consolidatedHash = hashJson(consolidated);
      if (this.lastConsolidatedHash !== consolidatedHash) {
        this.lastConsolidatedHash = consolidatedHash;
        this.gateway.broadcast('sensors/consolidated', consolidated);
      }

      // FIX: Resetear contador de errores en tick exitoso
      this.consecutiveErrors = 0;
    } catch (e) {
      this.consecutiveErrors++;
      this.logger.warn(`tick failed (unexpected): ${String((e as Error)?.message ?? e)}`);
    } finally {
      this.isTickRunning = false;
    }
  }
}
