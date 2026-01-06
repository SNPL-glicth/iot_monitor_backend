import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Device } from '../entities/device.entity';
import { Sensor } from '../entities/sensor.entity';
import { SensorReading } from '../entities/sensor-reading.entity';
import { Alert } from '../entities/alert.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';
import { SensorThresholdProfile } from '../entities/sensor-threshold-profile.entity';
import { ThresholdHistory } from '../entities/threshold-history.entity';
import { Prediction } from '../entities/prediction.entity';
import {
  DeviceWithSensorsView,
  ActiveAlertView,
  AlertsHistoryView,
  LatestSensorReadingView,
  MlEventActiveView,
} from '../entities/views';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MonitoringService {
  // repositorios principales para leer datos del sistema iot
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepo: Repository<Device>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(SensorReading)
    private readonly sensorReadingRepo: Repository<SensorReading>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
    @InjectRepository(SensorThresholdProfile)
    private readonly thresholdProfileRepo: Repository<SensorThresholdProfile>,
    @InjectRepository(ThresholdHistory)
    private readonly thresholdHistoryRepo: Repository<ThresholdHistory>,
    @InjectRepository(DeviceWithSensorsView)
    private readonly deviceWithSensorsViewRepo: Repository<DeviceWithSensorsView>,
    @InjectRepository(ActiveAlertView)
    private readonly activeAlertViewRepo: Repository<ActiveAlertView>,
    @InjectRepository(AlertsHistoryView)
    private readonly alertsHistoryViewRepo: Repository<AlertsHistoryView>,
    @InjectRepository(LatestSensorReadingView)
    private readonly latestSensorReadingViewRepo: Repository<LatestSensorReadingView>,
    @InjectRepository(MlEventActiveView)
    private readonly mlEventActiveViewRepo: Repository<MlEventActiveView>,
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly http: HttpService,
  ) {}

  private readonly telemetryBaseUrl = (process.env.TELEMETRY_IOT_URL || 'http://localhost:8099').replace(/\/$/, '');

  async getDbDebug(sensorIdRaw?: string) {
    const raw = String(sensorIdRaw ?? '').trim();
    const asNum = Number(raw);
    const sensorId = raw !== '' && Number.isFinite(asNum) ? Math.floor(asNum) : null;

    const nowRow = (await this.dataSource.query(
      `SELECT SYSDATETIME() AS now, DB_NAME() AS dbName, @@SERVERNAME AS serverName`,
    ))?.[0];

    let readings: any = null;
    let last5: any[] = [];

    if (sensorId !== null && sensorId > 0) {
      const countRow = (await this.dataSource.query(
        `
        SELECT
          COUNT(1) AS total,
          MAX([timestamp]) AS latestTs,
          MIN([timestamp]) AS earliestTs
        FROM dbo.sensor_readings WITH (NOLOCK)
        WHERE sensor_id = @0
        `,
        [sensorId],
      ))?.[0];

      readings = {
        sensorId,
        total: Number(countRow?.total ?? 0),
        latestTs: countRow?.latestTs ?? null,
        earliestTs: countRow?.earliestTs ?? null,
      };

      const rows = await this.dataSource.query(
        `
        SELECT TOP 5
          [timestamp] AS ts,
          CAST([value] AS float) AS value
        FROM dbo.sensor_readings WITH (NOLOCK)
        WHERE sensor_id = @0
        ORDER BY [timestamp] DESC
        `,
        [sensorId],
      );
      last5 = (rows ?? []).map((r: any) => ({ ts: r?.ts ?? null, value: r?.value ?? null }));
    }

    return {
      db: {
        now: nowRow?.now ?? null,
        dbName: nowRow?.dbName ?? null,
        serverName: nowRow?.serverName ?? null,
        config: {
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT) || 1434,
          database: process.env.DB_NAME || 'iot_monitoring_system',
          user: process.env.DB_USER || 'sa',
          encrypt: false,
          passwordLength: String(process.env.DB_PASSWORD ?? '').length,
        },
      },
      readings,
      last5,
    };
  }

  private async getTelemetry<T>(path: string, params?: Record<string, any>): Promise<T> {
    const url = `${this.telemetryBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const res$ = this.http.get(url, { params });
    const res: any = await firstValueFrom(res$);
    return res.data as T;
  }

  async getSensorThresholdsCanonical(sensorId: number) {
    const metrics = await this.getTelemetry<any>(`/telemetry/sensors/${sensorId}/metrics`);
    return {
      sensorId: String(sensorId),
      thresholds: metrics?.thresholds ?? { warning: { min: null, max: null }, alert: { min: null, max: null } },
    };
  }

  async getSensorDashboard(sensorId: number, range = '6h') {
    // Bug 1.1: Estado consolidado debe considerar alertas activas de BD,
    // no solo el estado instantáneo de telemetry.
    const [metrics, trading, activeAlerts, activeMlWarnings] = await Promise.all([
      this.getTelemetry<any>(`/telemetry/sensors/${sensorId}/metrics`),
      this.getTelemetry<any>(`/telemetry/sensors/${sensorId}/trading`, { range }),
      this.alertRepo.find({ where: { sensorId: String(sensorId), status: 'active' as any } }),
      this.mlEventActiveViewRepo.find({ where: { sensorId: String(sensorId) } }),
    ]);

    const activeCritical = activeAlerts.filter((a) => String(a.severity).toLowerCase() === 'critical').length;
    const activeWarning = activeAlerts.filter((a) => String(a.severity).toLowerCase() !== 'critical').length;
    const hasMlWarning = activeMlWarnings.length > 0;

    // Estado consolidado: ALERT activo > WARNING activo (ML o umbral) > metrics.state
    // Prioridad: 1) Alerta crítica activa, 2) Warning activo (ML o threshold), 3) Estado instantáneo
    let consolidatedState: 'ALERT' | 'WARNING' | 'NORMAL' = 'NORMAL';
    if (activeCritical > 0) {
      consolidatedState = 'ALERT';
    } else if (activeWarning > 0 || hasMlWarning) {
      consolidatedState = 'WARNING';
    } else {
      // Fallback al estado instantáneo de telemetry
      const metricsState = String(metrics?.state ?? 'NORMAL').toUpperCase();
      if (metricsState === 'ALERT') consolidatedState = 'ALERT';
      else if (metricsState === 'WARNING') consolidatedState = 'WARNING';
      else consolidatedState = 'NORMAL';
    }

    // Inyectar estado consolidado en metrics para que Flutter lo use sin recalcular
    const metricsWithConsolidated = {
      ...metrics,
      state: consolidatedState,
    };

    return {
      sensorId: String(sensorId),
      metrics: metricsWithConsolidated,
      trading,
      alerts: {
        activeCritical,
        activeWarning,
        activeMlWarnings: activeMlWarnings.length,
      },
    };
  }

  private normalizeNullableNumberString(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string') {
      const s = v.trim();
      if (s === '') return null;
      const n = Number(s);
      if (!Number.isFinite(n)) {
        throw new BadRequestException('Valor numérico inválido');
      }
      return String(n);
    }
    throw new BadRequestException('Valor numérico inválido');
  }

  private validateMinMaxPair(label: string, min: string | null, max: string | null) {
    if (min === null || max === null) return;
    const nMin = Number(min);
    const nMax = Number(max);
    if (!Number.isFinite(nMin) || !Number.isFinite(nMax)) {
      throw new BadRequestException(`${label}: valores inválidos`);
    }
    if (nMin > nMax) {
      throw new BadRequestException(`${label}: min no puede ser mayor que max`);
    }
  }

  private isDeadlock1205(err: any): boolean {
    const n =
      err?.number ??
      err?.codeNumber ??
      err?.driverError?.number ??
      err?.originalError?.number ??
      err?.cause?.number;
    return Number(n) === 1205;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withReadUncommitted<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();

    // Importante: en SQL Server, READ UNCOMMITTED equivale a NOLOCK / lecturas no bloqueantes.
    await qr.startTransaction('READ UNCOMMITTED');
    try {
      const out = await fn(qr.manager);
      await qr.commitTransaction();
      return out;
    } catch (e) {
      try {
        await qr.rollbackTransaction();
      } catch {
        // ignore
      }
      throw e;
    } finally {
      try {
        await qr.release();
      } catch {
        // ignore
      }
    }
  }

  private async withReadUncommittedRetry<T>(
    fn: (manager: EntityManager) => Promise<T>,
    opts?: { retries?: number; baseDelayMs?: number },
  ): Promise<T> {
    const retries = Math.max(0, Math.floor(opts?.retries ?? 2));
    const baseDelayMs = Math.max(0, Math.floor(opts?.baseDelayMs ?? 30));

    let attempt = 0;
    // 1 + retries total tries.
    while (true) {
      try {
        return await this.withReadUncommitted(fn);
      } catch (e) {
        if (!this.isDeadlock1205(e) || attempt >= retries) throw e;
        await this.sleep(baseDelayMs * Math.pow(2, attempt));
        attempt++;
      }
    }
  }

  private safeJsonParse(value: unknown): any | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || value.trim() === '') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private mapThresholdSeverityToState(severity: string | null | undefined): 'alert' | 'warning' {
    const s = String(severity ?? '').toLowerCase();
    if (s === 'critical') return 'alert';
    return 'warning';
  }

  private parseDecimalOrNull(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  private isOutOfRange(value: number, min: number | null, max: number | null): boolean {
    if (min === null && max === null) return false;
    if (min !== null && value < min) return true;
    if (max !== null && value > max) return true;
    return false;
  }

  private computeProfileState(args: {
    value: number;
    warningMin: number | null;
    warningMax: number | null;
    alertMin: number | null;
    alertMax: number | null;
  }): 'normal' | 'warning' | 'alert' {
    const isAlert = this.isOutOfRange(args.value, args.alertMin, args.alertMax);
    if (isAlert) return 'alert';
    const isWarn = this.isOutOfRange(args.value, args.warningMin, args.warningMax);
    if (isWarn) return 'warning';
    return 'normal';
  }

  private computeFinalState(args: {
    alertActive: any | null;
    warningActive: any | null;
    predictionCurrent: any | null;
  }): 'alert' | 'warning' | 'normal' {
    // IMPORTANTE: Las predicciones NO son un estado real.
    // Solo ALERT y WARNING (por umbral o delta spike) son estados reales.
    // Las predicciones son informativas y se devuelven en prediction_current,
    // pero NO afectan el final_state.
    if (args.alertActive) return 'alert';
    if (args.warningActive) return 'warning';
    return 'normal';
  }

  private parseWindowToMs(window: string): { key: string; pastMs: number; futureMs: number } {
    const w = String(window ?? '').trim().toLowerCase();
    // Ventanas simples: 1h, 6h, 24h, 7d
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    const map: Record<string, number> = {
      '1h': hour,
      '6h': 6 * hour,
      '24h': 24 * hour,
      '7d': 7 * day,
    };
    const base = map[w] ?? hour;
    // Por defecto mostramos pasado + futuro (para ver predicciones a futuro)
    return { key: map[w] ? w : '1h', pastMs: base, futureMs: base };
  }

  private toIso(value: Date | string | null): string | null {
    if (!value) return null;
    const d = typeof value === 'string' ? new Date(value) : value;
    const t = d.getTime();
    if (!Number.isFinite(t)) return null;
    return d.toISOString();
  }

  private clampSeriesToMaxPoints<T>(items: T[], maxPoints: number): T[] {
    if (items.length <= maxPoints) return items;
    return items.slice(items.length - maxPoints);
  }

  async getSensorConsolidatedStatus(sensorId: number) {
    return this.withReadUncommittedRetry(async (manager) => {
      const sensor = await manager.getRepository(Sensor).findOne({
        where: { id: String(sensorId) },
      });
      if (!sensor) {
        throw new NotFoundException('Sensor no existe');
      }

      // Umbrales físicos (tabla alerts):
      // - critical => ALERT
      // - warning/info => WARNING
      const [criticalAlertRow] = await manager.query(
        `
        SELECT TOP 1
          id,
          sensor_id      AS sensor_id,
          device_id      AS device_id,
          threshold_id   AS threshold_id,
          severity,
          status,
          triggered_value AS triggered_value,
          triggered_at    AS triggered_at
        FROM dbo.alerts WITH (NOLOCK)
        WHERE sensor_id = @0
          AND status = 'active'
          AND LOWER(severity) = 'critical'
        ORDER BY triggered_at DESC
        `,
        [sensorId],
      );

      const [thresholdWarningRow] = await manager.query(
        `
        SELECT TOP 1
          id,
          sensor_id      AS sensor_id,
          device_id      AS device_id,
          threshold_id   AS threshold_id,
          severity,
          status,
          triggered_value AS triggered_value,
          triggered_at    AS triggered_at
        FROM dbo.alerts WITH (NOLOCK)
        WHERE sensor_id = @0
          AND status = 'active'
          AND LOWER(severity) <> 'critical'
        ORDER BY triggered_at DESC
        `,
        [sensorId],
      );

      const [warningRow] = await manager.query(
        `
        SELECT TOP 1
          id,
          sensor_id AS sensor_id,
          device_id AS device_id,
          event_type AS event_type,
          event_code AS event_code,
          status,
          created_at AS created_at,
          title,
          message,
          payload
        FROM dbo.ml_events WITH (NOLOCK)
        WHERE sensor_id = @0
          AND event_code = 'DELTA_SPIKE'
          AND status = 'active'
        ORDER BY created_at DESC
        `,
        [sensorId],
      );

      const [predictionRow] = await manager.query(
        `
        SELECT TOP 1
          id,
          sensor_id AS sensor_id,
          model_id AS model_id,
          predicted_value AS predicted_value,
          confidence,
          predicted_at AS predicted_at,
          target_timestamp AS target_timestamp
        FROM dbo.predictions WITH (NOLOCK)
        WHERE sensor_id = @0
        ORDER BY predicted_at DESC
        `,
        [sensorId],
      );

      // Requisito explícito: consultar sensor_readings_latest aunque el DTO no lo exponga.
      // Lo usamos para validar que hay “estado” de lectura disponible, sin forzar a Flutter
      // a deducir reglas.
      await manager.query(
        `
        SELECT TOP 1 sensor_id, latest_value, latest_timestamp
        FROM dbo.sensor_readings_latest WITH (NOLOCK)
        WHERE sensor_id = @0
        `,
        [sensorId],
      );

      const alert_active =
        criticalAlertRow
          ? {
              id: Number(criticalAlertRow.id),
              sensor_id: Number(criticalAlertRow.sensor_id),
              device_id: Number(criticalAlertRow.device_id),
              threshold_id: Number(criticalAlertRow.threshold_id),
              severity: String(criticalAlertRow.severity),
              status: String(criticalAlertRow.status),
              triggered_value: Number(criticalAlertRow.triggered_value),
              triggered_at: criticalAlertRow.triggered_at,
            }
          : null;

      // Unificamos WARNING en una estructura homogénea (lista) para:
      // - eventos ML (ml_events)
      // - alertas físicas NO críticas (alerts severity != critical)
      const warning_items: any[] = [];

      if (warningRow) {
        warning_items.push({
          id: Number(warningRow.id),
          sensor_id: Number(warningRow.sensor_id),
          device_id: Number(warningRow.device_id),
          event_type: String(warningRow.event_type),
          event_code: String(warningRow.event_code),
          status: String(warningRow.status),
          created_at: warningRow.created_at,
          title: warningRow.title ?? null,
          message: warningRow.message ?? null,
          payload: this.safeJsonParse(warningRow.payload),
        });
      }

      if (thresholdWarningRow) {
        warning_items.push({
          id: Number(thresholdWarningRow.id),
          sensor_id: Number(thresholdWarningRow.sensor_id),
          device_id: Number(thresholdWarningRow.device_id),
          event_type: this.mapThresholdSeverityToState(thresholdWarningRow.severity) === 'alert'
            ? 'critical'
            : 'warning',
          event_code: 'THRESHOLD_BREACH',
          status: String(thresholdWarningRow.status),
          created_at: thresholdWarningRow.triggered_at,
          title: 'Umbral físico',
          message: `Valor fuera de umbral: ${thresholdWarningRow.triggered_value}`,
          payload: {
            threshold_id: Number(thresholdWarningRow.threshold_id),
            severity: String(thresholdWarningRow.severity),
            triggered_value: Number(thresholdWarningRow.triggered_value),
            triggered_at: thresholdWarningRow.triggered_at,
          },
        });
      }

      const prediction_current =
        predictionRow
          ? {
              id: Number(predictionRow.id),
              sensor_id: Number(predictionRow.sensor_id),
              model_id: Number(predictionRow.model_id),
              predicted_value: Number(predictionRow.predicted_value),
              confidence: Number(predictionRow.confidence),
              predicted_at: predictionRow.predicted_at,
              target_timestamp: predictionRow.target_timestamp,
            }
          : null;

      // Tomamos 1 warning “activo” representativo (si hay varios), pero mantenemos
      // el array completo para UI de histórico.
      const warning_active = warning_items.length > 0 ? warning_items[0] : null;

      const final_state = this.computeFinalState({
        alertActive: alert_active,
        warningActive: warning_active,
        predictionCurrent: prediction_current,
      });

      return {
        sensor_id: Number(sensorId),
        final_state,
        alert_active,
        warning_active: warning_items,
        prediction_current,
      };
    });
  }

  /**
   * Perf 2.1: Batch endpoint para obtener status consolidado de múltiples sensores.
   * Elimina el problema N+1 donde Flutter hacía 1 request por sensor.
   */
  async getSensorConsolidatedStatusBatch(idsRaw: string) {
    const ids = String(idsRaw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (ids.length === 0) {
      return { items: [] };
    }

    // Limitar a máximo 50 sensores por request para evitar abuse
    const limitedIds = ids.slice(0, 50);

    // Ejecutar en paralelo con Promise.allSettled para no fallar todo si uno falla
    const results = await Promise.allSettled(
      limitedIds.map((id) => this.getSensorConsolidatedStatus(id)),
    );

    const items = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value);

    return { items };
  }

  /**
   * Devuelve métricas consolidadas para "Detalles de Sensor":
   * - lecturas reales
   * - predicciones ML
   * - marcas WARNING/ALERT
   * - rango min/max (para auto-scale en frontend)
   */
  async getSensorMetrics(sensorId: number, window = '1h') {
    const parsed = this.parseWindowToMs(window);
    const now = new Date();
    const start = new Date(now.getTime() - parsed.pastMs);
    // Lecturas: estrictamente pasado hasta NOW.
    const endReadings = now;
    // Predicciones: pasado+futuro para ver target_timestamp hacia adelante.
    const endPredictions = new Date(now.getTime() + parsed.futureMs);

    return this.withReadUncommittedRetry(async (manager) => {
      const sensor = await manager.getRepository(Sensor).findOne({ where: { id: String(sensorId) } });
      if (!sensor) throw new NotFoundException('Sensor no existe');

      // Traemos una ventana fija de puntos para evitar respuestas enormes.
      const maxPoints = 90;

      // Últimas N lecturas dentro de la ventana (y luego re-ordenadas ASC para graficar)
      const readingsRaw = await manager.query(
        `
        SELECT * FROM (
          SELECT TOP (@2)
            sensor_id AS sensorId,
            value     AS value,
            timestamp AS ts
          FROM dbo.sensor_readings WITH (NOLOCK)
          WHERE sensor_id = @0
            AND timestamp >= @1
            AND timestamp <= @3
          ORDER BY timestamp DESC
        ) x
        ORDER BY x.ts ASC
        `,
        [sensorId, start, maxPoints, endReadings],
      );

      const predsRaw = await manager.query(
        `
        SELECT TOP (@2)
          sensor_id        AS sensorId,
          predicted_value  AS predictedValue,
          target_timestamp AS ts
        FROM dbo.predictions WITH (NOLOCK)
        WHERE sensor_id = @0
          AND target_timestamp >= @1
          AND target_timestamp <= @3
        ORDER BY target_timestamp ASC
        `,
        [sensorId, start, maxPoints, endPredictions],
      );

      // Eventos: ALERT/WARNING por threshold (tabla alerts) + WARNING delta spike (ml_events)
      const alertsRaw = await manager.query(
        `
        SELECT TOP 20
          severity,
          status,
          triggered_at AS ts
        FROM dbo.alerts WITH (NOLOCK)
        WHERE sensor_id = @0
          AND triggered_at >= @1
          AND triggered_at <= @2
        ORDER BY triggered_at ASC
        `,
        [sensorId, start, endReadings],
      );

      const mlRaw = await manager.query(
        `
        SELECT TOP 20
          event_code AS eventCode,
          status,
          created_at AS ts
        FROM dbo.ml_events WITH (NOLOCK)
        WHERE sensor_id = @0
          AND created_at >= @1
          AND created_at <= @2
          AND event_code = 'DELTA_SPIKE'
        ORDER BY created_at ASC
        `,
        [sensorId, start, endReadings],
      );

      // Límite defensivo de eventos ML en la ventana:
      // - cooldown por sensor (segundos)
      // - máximo de eventos por ventana
      // Nota: esto controla la respuesta del API; el control definitivo debería aplicarse
      // también en el productor de ml_events.
      const mlCooldownSeconds = Math.max(60, Number(process.env.ML_EVENT_COOLDOWN_SECONDS ?? '900') || 900);
      const mlMaxPerWindow = Math.max(1, Number(process.env.ML_EVENT_MAX_PER_WINDOW ?? '6') || 6);

      const mlFiltered: any[] = [];
      let lastAcceptedAt = 0;
      for (const e of mlRaw ?? []) {
        if (mlFiltered.length >= mlMaxPerWindow) break;
        const ts = new Date(e.ts);
        const t = ts.getTime();
        if (!Number.isFinite(t)) continue;
        if (!lastAcceptedAt || t - lastAcceptedAt >= mlCooldownSeconds * 1000) {
          mlFiltered.push(e);
          lastAcceptedAt = t;
        }
      }

      type Pt = {
        ts: Date;
        value: number | null;
        prediction: number | null;
        event: 'WARNING' | 'ALERT' | null;
      };

      // Unimos timestamps de lecturas + predicciones en una sola serie.
      // Flutter solo dibuja; aquí se arma el dataset ya consolidado.
      const byIso = new Map<string, Pt>();

      for (const r of readingsRaw ?? []) {
        const ts = new Date(r.ts);
        const iso = this.toIso(ts);
        if (!iso) continue;
        const existing = byIso.get(iso);
        const v = this.parseOptionalNumber(r.value);
        if (existing) {
          existing.value = v;
        } else {
          byIso.set(iso, { ts, value: v, prediction: null, event: null });
        }
      }

      for (const p of predsRaw ?? []) {
        const ts = new Date(p.ts);
        const iso = this.toIso(ts);
        if (!iso) continue;
        const pv = this.parseOptionalNumber(p.predictedValue);
        const existing = byIso.get(iso);
        if (existing) {
          existing.prediction = pv;
        } else {
          byIso.set(iso, { ts, value: null, prediction: pv, event: null });
        }
      }

      const seriesAll = Array.from(byIso.values()).filter((x) => Number.isFinite(x.ts.getTime()));
      seriesAll.sort((a, b) => a.ts.getTime() - b.ts.getTime());

      // Marcar eventos en el punto más cercano (±5 minutos) dentro de la serie consolidada.
      const markNearest = (eventTs: Date, kind: 'WARNING' | 'ALERT') => {
        if (seriesAll.length === 0) return;
        const target = eventTs.getTime();
        let bestIdx = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < seriesAll.length; i++) {
          const d = Math.abs(seriesAll[i].ts.getTime() - target);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        if (bestIdx < 0) return;
        if (bestDist > 5 * 60 * 1000) return;
        // ALERT tiene prioridad sobre WARNING
        if (kind === 'ALERT') {
          seriesAll[bestIdx].event = 'ALERT';
        } else {
          if (seriesAll[bestIdx].event !== 'ALERT') {
            seriesAll[bestIdx].event = 'WARNING';
          }
        }
      };

      for (const a of alertsRaw ?? []) {
        const ts = new Date(a.ts);
        if (!Number.isFinite(ts.getTime())) continue;
        const sev = String(a.severity ?? '').toLowerCase();
        const kind: 'WARNING' | 'ALERT' = sev === 'critical' ? 'ALERT' : 'WARNING';
        markNearest(ts, kind);
      }

      for (const e of mlFiltered ?? []) {
        const ts = new Date(e.ts);
        if (!Number.isFinite(ts.getTime())) continue;
        markNearest(ts, 'WARNING');
      }

      const trimmed = this.clampSeriesToMaxPoints(seriesAll, maxPoints);

      // Rango estrictamente basado en lecturas reales: evita que predicciones
      // “aplasten” el gráfico y se pierdan caídas/subidas reales.
      const readingValues: number[] = [];
      for (const p of trimmed) {
        if (typeof p.value === 'number' && Number.isFinite(p.value)) readingValues.push(p.value);
      }
      const rangeMin = readingValues.length ? Math.min(...readingValues) : null;
      const rangeMax = readingValues.length ? Math.max(...readingValues) : null;

      const fluctuation =
        typeof rangeMin === 'number' && typeof rangeMax === 'number' ? Number((rangeMax - rangeMin).toFixed(6)) : null;

      let alertsCount = 0;
      let warningsCount = 0;

      for (const a of alertsRaw ?? []) {
        const sev = String(a.severity ?? '').toLowerCase();
        if (sev === 'critical') alertsCount += 1;
        else warningsCount += 1;
      }

      // ML DELTA_SPIKE se considera WARNING (aplicando límite/cooldown)
      warningsCount += (mlFiltered ?? []).length;

      return {
        sensorId: String(sensorId),
        sensorName: sensor.name,
        unit: sensor.unit,
        window: parsed.key,
        range: {
          min: rangeMin,
          max: rangeMax,
        },
        fluctuation,
        events: {
          alerts: alertsCount,
          warnings: warningsCount,
        },
        series: trimmed.map((p) => ({
          timestamp: this.toIso(p.ts),
          value: p.value,
          prediction: p.prediction,
          event: p.event,
        })),
      };
    });
  }

  private parseOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  private getLimitBounds(sensorType: string, unit: string): { min: number; max: number } {
    const t = (sensorType || '').toLowerCase().trim();
    const u = (unit || '').toLowerCase().trim();

    // Rangos “realistas” (ajústalos a tu dominio). La idea es frenar inputs absurdos
    // que luego rompan reportes / reglas / SPs o generen ruido.
    if (t === 'temperature' || u.includes('°c') || u === 'c') {
      return { min: -50, max: 150 };
    }
    if (t === 'humidity' || u === '%') {
      return { min: 0, max: 100 };
    }
    if (t === 'air_quality' || u === 'ppm') {
      return { min: 0, max: 5000 };
    }
    if (t === 'voltage' || u === 'v' || u.includes('volt')) {
      return { min: 0, max: 600 };
    }
    if (t === 'power' || u === 'w' || u === 'kw') {
      return { min: 0, max: 100000 };
    }

    // Default: rango amplio (pero no infinito)
    return { min: -1000000000, max: 1000000000 };
  }

  private validateLimitPayload(args: {
    sensorType: string;
    unit: string;
    conditionType: string;
    thresholdValueMin: unknown;
    thresholdValueMax: unknown;
  }) {
    const condition = (args.conditionType || '').toLowerCase().trim();

    const allowed = new Set(['greater_than', 'less_than', 'equal_to', 'out_of_range']);
    if (!allowed.has(condition)) {
      throw new BadRequestException('Condición inválida para el límite.');
    }

    const min = this.parseOptionalNumber(args.thresholdValueMin);
    const max = this.parseOptionalNumber(args.thresholdValueMax);

    if (condition === 'out_of_range') {
      if (min === null || max === null) {
        throw new BadRequestException('Para "fuera de rango" debes indicar mínimo y máximo.');
      }
      if (min > max) {
        throw new BadRequestException('El mínimo no puede ser mayor al máximo.');
      }
    } else {
      // greater_than / less_than / equal_to
      if (min === null) {
        throw new BadRequestException('Debes indicar el valor del límite.');
      }
    }

    const bounds = this.getLimitBounds(args.sensorType, args.unit);

    const checkOne = (label: string, v: number) => {
      if (v < bounds.min || v > bounds.max) {
        const unitSuffix = args.unit && args.unit.trim() ? ` ${args.unit}` : '';
        throw new BadRequestException(
          `${label} fuera de rango realista para este sensor (permitido: ${bounds.min} a ${bounds.max}${unitSuffix}).`,
        );
      }
    };

    if (min !== null) checkOne('Valor', min);
    if (max !== null) checkOne('Valor', max);

    return { min, max, conditionType: condition };
  }

  // convierte fechas a un texto sencillo para mostrar en el dashboard
  private formatDateTime(value: Date | string | null): string | null {
    if (!value) {
      return null;
    }

    const date = typeof value === 'string' ? new Date(value) : value;

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  /**
   * Lista dispositivos con sus sensores (vista v_devices_with_sensors)
   */
  async getDevicesWithSensors() {
    return this.withReadUncommittedRetry(async (manager) => {
      const rows = await manager.getRepository(DeviceWithSensorsView).find();
      return rows.map((row) => ({
        ...row,
        lastConnection: this.formatDateTime(row.lastConnection ?? null),
      }));
    });
  }

  /**
   * Devuelve las últimas lecturas por sensor (vista v_latest_sensor_readings)
   *
   * Importante: usamos un SELECT directo con WITH (NOLOCK) para evitar que el
   * polling en tiempo real bloquee la ingesta (READ UNCOMMITTED).
   */
  async getLatestSensorReadings() {
    return this.withReadUncommittedRetry(async (manager) => {
      const rows = await manager.query(
        `
        SELECT
          lr.sensor_id      AS sensorId,
          lr.sensor_uuid    AS sensorUuid,
          lr.sensor_name    AS sensorName,
          lr.sensor_type    AS sensorType,
          lr.unit           AS unit,
          lr.device_name    AS deviceName,
          lr.latest_value   AS latestValue,
          lr.latest_timestamp AS latestTimestamp
        FROM v_latest_sensor_readings lr WITH (NOLOCK)
        `,
      );

      return (rows ?? []).map((row: any) => ({
        ...row,
        latestTimestamp: this.formatDateTime(row.latestTimestamp ?? null),
      }));
    });
  }

  /**
   * Devuelve alertas activas/acknowledged.
   *
   * Nota: usamos v_alerts_history (en vez de v_active_alerts) para incluir sensorId
   * y permitir navegación directa al detalle del sensor desde el frontend.
   */
  async getActiveAlerts(limit = 100) {
    const rows = await this.withReadUncommittedRetry(async (manager) =>
      manager
        .getRepository(AlertsHistoryView)
        .createQueryBuilder('a')
        .setLock('dirty_read')
        .where('a.status IN (:...st)', { st: ['active', 'acknowledged'] })
        .orderBy('a.triggeredAt', 'DESC')
        .limit(limit)
        .getMany(),
    );

    return rows.map((row) => ({
      alertId: row.alertId,
      sensorId: row.sensorId,
      severity: row.severity,
      status: row.status,
      triggeredValue: row.triggeredValue,
      triggeredAt: this.formatDateTime(row.triggeredAt ?? null),
      deviceName: row.deviceName,
      deviceUuid: row.deviceUuid,
      sensorName: row.sensorName,
      sensorType: row.sensorType,
      unit: row.unit,
      thresholdName: row.thresholdName,
      conditionType: row.conditionType,
      thresholdValueMin: row.thresholdValueMin,
      thresholdValueMax: row.thresholdValueMax,
    }));
  }

  /**
   * Historial de alertas (por sensor).
   */
  async getSensorAlertsHistory(sensorId: number, limit = 50) {
    const rows = await this.withReadUncommittedRetry(async (manager) =>
      manager
        .getRepository(AlertsHistoryView)
        .createQueryBuilder('a')
        .setLock('dirty_read')
        .where('a.sensorId = :sensorId', { sensorId: String(sensorId) })
        .orderBy('a.triggeredAt', 'DESC')
        .limit(limit)
        .getMany(),
    );

    return rows.map((row) => ({
      alertId: row.alertId,
      sensorId: row.sensorId,
      severity: row.severity,
      status: row.status,
      triggeredValue: row.triggeredValue,
      triggeredAt: this.formatDateTime(row.triggeredAt ?? null),
      thresholdName: row.thresholdName,
      conditionType: row.conditionType,
      thresholdValueMin: row.thresholdValueMin,
      thresholdValueMax: row.thresholdValueMax,
      acknowledgedAt: this.formatDateTime(row.acknowledgedAt ?? null),
      acknowledgedByUsername: row.acknowledgedByUsername,
      resolvedAt: this.formatDateTime(row.resolvedAt ?? null),
      resolvedByUsername: row.resolvedByUsername,
    }));
  }

  /**
   * Devuelve eventos ML activos/acknowledged (vista v_ml_events_active)
   */
  async getActiveMlEvents(limit = 50) {
    const rows = await this.withReadUncommittedRetry(async (manager) =>
      manager
        .getRepository(MlEventActiveView)
        .createQueryBuilder('e')
        .setLock('dirty_read')
        .orderBy('e.createdAt', 'DESC')
        .limit(limit)
        .getMany(),
    );

    return rows.map((row) => ({
      ...row,
      createdAt: this.formatDateTime(row.createdAt ?? null),
      targetTimestamp: this.formatDateTime(row.targetTimestamp ?? null),
    }));
  }

  /**
   * Devuelve las últimas predicciones generadas por modelos ML.
   */
  async getLatestPredictions(limit = 50) {
    const rows = await this.withReadUncommittedRetry(async (manager) =>
      manager
        .getRepository(Prediction)
        .createQueryBuilder('p')
        .setLock('dirty_read')
        .leftJoinAndSelect('p.model', 'model')
        .leftJoinAndSelect('p.sensor', 'sensor')
        .leftJoinAndSelect('sensor.device', 'device')
        .orderBy('p.targetTimestamp', 'ASC')
        .limit(limit)
        .getMany(),
    );

    return rows.map((p) => ({
      id: p.id,
      predictedValue: p.predictedValue,
      confidence: p.confidence,
      predictedAt: this.formatDateTime(p.predictedAt),
      targetTimestamp: this.formatDateTime(p.targetTimestamp),
      sensorName: p.sensor.name,
      unit: p.sensor.unit,
      deviceName: p.sensor.device?.name ?? '',
      modelName: p.model.modelName,
      modelVersion: p.model.version,
    }));
  }

  /**
   * Inserta una lectura para un sensor usando el SP sp_insert_reading_and_check_threshold
   * Esto también evaluará los umbrales y generará alertas si corresponde.
   */
  async insertSensorReading(sensorId: number, value: number) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new BadRequestException('Valor inválido');
    }

    await this.dataSource.transaction(async (manager) => {
      const sensor = await manager.getRepository(Sensor).findOne({
        where: { id: String(sensorId) },
        relations: ['device', 'thresholdProfile'],
      });
      if (!sensor) throw new NotFoundException('Sensor no existe');

      const now = new Date();

      // 1) Insert lectura histórica
      const reading = manager.getRepository(SensorReading).create({
        sensor,
        value: String(numericValue),
        timestamp: now,
      });
      await manager.getRepository(SensorReading).save(reading);

      // 2) Actualizar tabla materializada latest (evita escaneos)
      await manager.query(
        `
        MERGE dbo.sensor_readings_latest AS tgt
        USING (SELECT @0 AS sensor_id, @1 AS latest_value, @2 AS latest_timestamp) AS src
          ON tgt.sensor_id = src.sensor_id
        WHEN MATCHED THEN
          UPDATE SET tgt.latest_value = src.latest_value, tgt.latest_timestamp = src.latest_timestamp
        WHEN NOT MATCHED THEN
          INSERT (sensor_id, latest_value, latest_timestamp)
          VALUES (src.sensor_id, src.latest_value, src.latest_timestamp);
        `,
        [sensorId, numericValue, now],
      );

      // 3) Evaluación con perfil explícito
      const profile = sensor.thresholdProfile ?? null;
      if (!profile) {
        // Sin perfil, solo persistimos lecturas.
        return;
      }

      const warningMin = this.parseDecimalOrNull(profile.warningMin);
      const warningMax = this.parseDecimalOrNull(profile.warningMax);
      const alertMin = this.parseDecimalOrNull(profile.alertMin);
      const alertMax = this.parseDecimalOrNull(profile.alertMax);
      const cooldownSeconds = Math.max(0, Math.floor(profile.cooldownSeconds ?? 0));

      const newState = this.computeProfileState({
        value: numericValue,
        warningMin,
        warningMax,
        alertMin,
        alertMax,
      });

      // Estado previo: revisamos alertas ACTIVAS (dedupe DB garantiza max 1 por severidad)
      const active = await manager.getRepository(Alert).find({
        where: { sensorId: String(sensorId), status: 'active' as any },
        order: { triggeredAt: 'DESC' },
        take: 5,
      });

      const hasCriticalActive = active.some((a) => String(a.severity).toLowerCase() === 'critical');
      const hasWarningActive = active.some((a) => String(a.severity).toLowerCase() === 'warning');

      const prevState: 'normal' | 'warning' | 'alert' = hasCriticalActive
        ? 'alert'
        : hasWarningActive
          ? 'warning'
          : 'normal';

      // Regla: no generar eventos si no hay cruce real.
      if (newState === prevState) {
        return;
      }

      // Helpers
      const resolveSeverity = async (sev: 'critical' | 'warning') => {
        const rows = active.filter((a) => String(a.severity).toLowerCase() === sev);
        for (const a of rows) {
          await manager.getRepository(Alert).update(
            { id: a.id },
            { status: 'resolved' as any, resolvedAt: now },
          );
        }
      };

      const canCreateWithCooldown = async (sev: 'critical' | 'warning') => {
        if (cooldownSeconds <= 0) return true;
        const last = await manager
          .getRepository(Alert)
          .createQueryBuilder('a')
          .where('a.sensorId = :sensorId', { sensorId: String(sensorId) })
          .andWhere('LOWER(a.severity) = :sev', { sev })
          .orderBy('a.triggeredAt', 'DESC')
          .getOne();
        if (!last?.triggeredAt) return true;
        const ageMs = now.getTime() - new Date(last.triggeredAt).getTime();
        return ageMs >= cooldownSeconds * 1000;
      };

      const createAlert = async (sev: 'critical' | 'warning') => {
        // Dedup DB: si existe activa, no creamos.
        const alreadyActive = active.some((a) => String(a.severity).toLowerCase() === sev);
        if (alreadyActive) return null;
        if (!(await canCreateWithCooldown(sev))) return null;

        const created = manager.getRepository(Alert).create({
          thresholdId: null,
          sensor,
          sensorId: String(sensorId),
          device: sensor.device,
          deviceId: String(sensor.device.id),
          severity: sev as any,
          status: 'active' as any,
          triggeredValue: String(numericValue),
          triggeredAt: now,
        });

        try {
          return await manager.getRepository(Alert).save(created);
        } catch (e) {
          // Si el índice UNIQUE filtrado bloquea duplicado concurrente, ignoramos.
          return null;
        }
      };

      // Transiciones
      // - normal: resolver todo
      // - warning: resolver critical, asegurar warning
      // - alert: resolver warning, asegurar critical
      if (newState === 'normal') {
        await resolveSeverity('critical');
        await resolveSeverity('warning');
        return;
      }

      if (newState === 'warning') {
        await resolveSeverity('critical');
        await createAlert('warning');
        return;
      }

      // newState === 'alert'
      await resolveSeverity('warning');
      const created = await createAlert('critical');

      // Push solo para ALERT crítica.
      try {
        if (created?.id) {
          await this.notificationsService.sendAlertNotification(String(created.id));
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error sending alert push notification', e);
      }
    });
  }

  async getDeviceById(id: number) {
    return this.withReadUncommittedRetry(async (manager) =>
      manager.getRepository(Device).findOne({ where: { id: String(id) } }),
    );
  }

  async getSensorReadings(sensorId: number, limit = 100) {
    return this.withReadUncommittedRetry(async (manager) =>
      manager.getRepository(SensorReading).find({
        where: { sensor: { id: String(sensorId) } },
        order: { timestamp: 'DESC' },
        take: limit,
        relations: ['sensor', 'sensor.device'],
      }),
    );
  }

  async getSensorThresholdProfile(sensorId: number) {
    const sensor = await this.sensorRepo.findOne({ where: { id: String(sensorId) } });
    if (!sensor) {
      throw new NotFoundException('Sensor no existe');
    }

    const row = await this.thresholdProfileRepo.findOne({
      where: { sensorId: String(sensorId) },
    });

    if (!row) {
      return {
        sensorId: String(sensorId),
        warningMin: null,
        warningMax: null,
        alertMin: null,
        alertMax: null,
        cooldownSeconds: 300,
        updatedAt: null,
      };
    }

    return {
      sensorId: String(sensorId),
      warningMin: row.warningMin ?? null,
      warningMax: row.warningMax ?? null,
      alertMin: row.alertMin ?? null,
      alertMax: row.alertMax ?? null,
      cooldownSeconds: Number(row.cooldownSeconds ?? 300),
      updatedAt: row.updatedAt ?? null,
    };
  }

  async upsertSensorThresholdProfile(
    sensorId: number,
    body: {
      warningMin?: unknown;
      warningMax?: unknown;
      alertMin?: unknown;
      alertMax?: unknown;
      cooldownSeconds?: unknown;
    },
  ) {
    const sensor = await this.sensorRepo.findOne({ where: { id: String(sensorId) } });
    if (!sensor) {
      throw new NotFoundException('Sensor no existe');
    }

    const warningMin = body.warningMin === undefined ? undefined : this.normalizeNullableNumberString(body.warningMin);
    const warningMax = body.warningMax === undefined ? undefined : this.normalizeNullableNumberString(body.warningMax);
    const alertMin = body.alertMin === undefined ? undefined : this.normalizeNullableNumberString(body.alertMin);
    const alertMax = body.alertMax === undefined ? undefined : this.normalizeNullableNumberString(body.alertMax);

    const cooldownSecondsRaw = body.cooldownSeconds;
    const cooldownSeconds =
      cooldownSecondsRaw === undefined || cooldownSecondsRaw === null || String(cooldownSecondsRaw).trim() === ''
        ? undefined
        : Math.max(0, Math.floor(Number(cooldownSecondsRaw)));
    if (cooldownSeconds !== undefined && !Number.isFinite(cooldownSeconds)) {
      throw new BadRequestException('cooldownSeconds inválido');
    }

    const existing = await this.thresholdProfileRepo.findOne({
      where: { sensorId: String(sensorId) },
    });

    const nextWarningMin = warningMin === undefined ? existing?.warningMin ?? null : warningMin;
    const nextWarningMax = warningMax === undefined ? existing?.warningMax ?? null : warningMax;
    const nextAlertMin = alertMin === undefined ? existing?.alertMin ?? null : alertMin;
    const nextAlertMax = alertMax === undefined ? existing?.alertMax ?? null : alertMax;

    this.validateMinMaxPair('WARNING', nextWarningMin, nextWarningMax);
    this.validateMinMaxPair('ALERT', nextAlertMin, nextAlertMax);

    // Regla mínima de integridad: el rango ALERT debería ser igual o más estricto que WARNING.
    // (No bloquea casos con nulls.)
    if (nextWarningMin !== null && nextAlertMin !== null) {
      if (Number(nextAlertMin) > Number(nextWarningMin)) {
        throw new BadRequestException('alert_min no puede ser mayor que warning_min');
      }
    }
    if (nextWarningMax !== null && nextAlertMax !== null) {
      if (Number(nextAlertMax) < Number(nextWarningMax)) {
        throw new BadRequestException('alert_max no puede ser menor que warning_max');
      }
    }

    const row = existing
      ? existing
      : this.thresholdProfileRepo.create({
          sensorId: String(sensorId),
          sensor,
          cooldownSeconds: 300,
          updatedAt: null,
        });

    row.warningMin = nextWarningMin;
    row.warningMax = nextWarningMax;
    row.alertMin = nextAlertMin;
    row.alertMax = nextAlertMax;
    if (cooldownSeconds !== undefined) row.cooldownSeconds = cooldownSeconds;
    row.updatedAt = new Date();

    const saved = await this.thresholdProfileRepo.save(row);
    return {
      sensorId: String(sensorId),
      warningMin: saved.warningMin ?? null,
      warningMax: saved.warningMax ?? null,
      alertMin: saved.alertMin ?? null,
      alertMax: saved.alertMax ?? null,
      cooldownSeconds: Number(saved.cooldownSeconds ?? 300),
      updatedAt: saved.updatedAt ?? null,
    };
  }

  /**
   * Umbrales configurados del sensor.
   * Importante: son por sensor (no por device), para soportar devices con múltiples sensores
   * (ej: nevera = temperatura + humedad, cada uno con sus propios thresholds).
   */
  async getSensorThresholds(sensorId: number) {
    const rows = await this.withReadUncommittedRetry(async (manager) =>
      manager.getRepository(AlertThreshold).find({
        where: {
          sensorId: String(sensorId),
          isActive: true,
        },
        order: {
          severity: 'DESC',
          id: 'ASC',
        },
      }),
    );

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
    // Regla de producto: 1 límite activo por sensor.
    const existing = await this.thresholdRepo.findOne({
      where: {
        sensorId: String(sensorId),
        isActive: true,
      },
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

    const validated = this.validateLimitPayload({
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
  }

  /**
   * Actualiza un threshold y guarda historial ANTES de sobrescribir.
   */
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
    const t = await this.thresholdRepo.findOne({ where: { id: String(thresholdId) } });
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

    // Nuevo payload propuesto (si no viene, mantenemos el actual)
    const proposedMin = body.thresholdValueMin === undefined ? oldMin : body.thresholdValueMin;
    const proposedMax = body.thresholdValueMax === undefined ? oldMax : body.thresholdValueMax;

    const validated = this.validateLimitPayload({
      sensorType: sensor.sensorType,
      unit: sensor.unit,
      conditionType: t.conditionType,
      thresholdValueMin: proposedMin,
      thresholdValueMax: proposedMax,
    });

    const newMin = validated.min === null ? null : String(validated.min);
    const newMax = validated.max === null ? null : String(validated.max);

    // historial
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

    // update
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
  }

  async deactivateThreshold(
    thresholdId: number,
    changedByUserId: string,
    reason?: string | null,
  ) {
    const t = await this.thresholdRepo.findOne({ where: { id: String(thresholdId) } });
    if (!t) {
      throw new NotFoundException('Límite no existe');
    }

    // historial: min/max no cambian, pero queda auditado el evento
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
    const rows = await this.withReadUncommittedRetry(async (manager) =>
      manager.getRepository(ThresholdHistory).find({
        where: { thresholdId: String(thresholdId) },
        order: { changedAt: 'DESC' },
      }),
    );

    return rows.map((h) => ({
      id: h.id,
      thresholdId: h.thresholdId,
      oldMin: h.oldMin,
      oldMax: h.oldMax,
      newMin: h.newMin,
      newMax: h.newMax,
      changedBy: h.changedBy,
      changedAt: this.formatDateTime(h.changedAt) ?? '-',
      reason: h.reason,
    }));
  }
}
