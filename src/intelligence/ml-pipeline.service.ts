import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan, IsNull, Not } from 'typeorm';
import { Prediction } from '../entities/prediction.entity';
import { MlEvent } from '../entities/ml-event.entity';
import { Sensor } from '../entities/sensor.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';

/**
 * Códigos de eventos ML
 */
export enum MlEventCode {
  PRED_THRESHOLD_BREACH = 'PRED_THRESHOLD_BREACH',  // Predicción cruza umbral
  ANOMALY_DETECTED = 'ANOMALY_DETECTED',            // Anomalía detectada por ML
  TREND_ALERT = 'TREND_ALERT',                      // Tendencia peligrosa
  DELTA_SPIKE = 'DELTA_SPIKE',                      // Cambio brusco (ya existe)
  HIGH_RISK = 'HIGH_RISK',                          // Nivel de riesgo alto
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',                // Predicción con baja confianza
}

/**
 * Tipos de eventos ML (severidad)
 */
export enum MlEventType {
  NOTICE = 'notice',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * Resultado del diagnóstico del pipeline ML
 */
export interface MlPipelineDiagnostic {
  timestamp: string;
  predictions: {
    total: number;
    withFutureTarget: number;
    withPastTarget: number;
    byRiskLevel: Record<string, number>;
    bySeverity: Record<string, number>;
    byAnomaly: { anomalies: number; normal: number };
  };
  mlEvents: {
    total: number;
    active: number;
    acknowledged: number;
    resolved: number;
    byEventCode: Record<string, number>;
  };
  conversion: {
    predictionsWithoutEvent: number;
    predictionsWithEvent: number;
    conversionRate: string;
  };
  issues: string[];
  recommendations: string[];
}

/**
 * Resultado de la conversión de predicciones a eventos
 */
export interface ConversionResult {
  processed: number;
  created: number;
  skipped: number;
  errors: string[];
  details: Array<{
    predictionId: string;
    action: 'created' | 'skipped' | 'error';
    reason?: string;
    eventId?: string;
  }>;
}

@Injectable()
export class MlPipelineService {
  private readonly logger = new Logger(MlPipelineService.name);

  constructor(
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
    @InjectRepository(MlEvent)
    private readonly mlEventRepo: Repository<MlEvent>,
    @InjectRepository(Sensor)
    private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(AlertThreshold)
    private readonly thresholdRepo: Repository<AlertThreshold>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * DIAGNÓSTICO COMPLETO DEL PIPELINE ML
   * Identifica exactamente dónde se rompe la conversión prediction → ml_event
   */
  async diagnosePipeline(): Promise<MlPipelineDiagnostic> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 1. Contar predicciones
    const totalPredictions = await this.predictionRepo.count();
    
    const predictionsWithFutureTarget = await this.predictionRepo
      .createQueryBuilder('p')
      .where('p.target_timestamp > GETDATE()')
      .getCount();
    
    const predictionsWithPastTarget = totalPredictions - predictionsWithFutureTarget;

    // 2. Agrupar predicciones por risk_level
    const riskLevelAgg = await this.dataSource.query(`
      SELECT COALESCE(risk_level, 'NULL') as risk_level, COUNT(*) as cnt
      FROM predictions
      GROUP BY risk_level
    `);
    const byRiskLevel: Record<string, number> = {};
    for (const row of riskLevelAgg) {
      byRiskLevel[row.risk_level] = Number(row.cnt);
    }

    // 3. Agrupar predicciones por severity
    const severityAgg = await this.dataSource.query(`
      SELECT COALESCE(severity, 'NULL') as severity, COUNT(*) as cnt
      FROM predictions
      GROUP BY severity
    `);
    const bySeverity: Record<string, number> = {};
    for (const row of severityAgg) {
      bySeverity[row.severity] = Number(row.cnt);
    }

    // 4. Contar anomalías
    const anomalyAgg = await this.dataSource.query(`
      SELECT 
        SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) as anomalies,
        SUM(CASE WHEN is_anomaly = 0 OR is_anomaly IS NULL THEN 1 ELSE 0 END) as normal
      FROM predictions
    `);
    const anomalies = Number(anomalyAgg[0]?.anomalies ?? 0);
    const normal = Number(anomalyAgg[0]?.normal ?? 0);

    // 5. Contar ml_events
    const totalMlEvents = await this.mlEventRepo.count();
    
    const mlEventsByStatus = await this.dataSource.query(`
      SELECT status, COUNT(*) as cnt
      FROM ml_events
      GROUP BY status
    `);
    let activeEvents = 0, acknowledgedEvents = 0, resolvedEvents = 0;
    for (const row of mlEventsByStatus) {
      if (row.status === 'active') activeEvents = Number(row.cnt);
      else if (row.status === 'acknowledged') acknowledgedEvents = Number(row.cnt);
      else if (row.status === 'resolved') resolvedEvents = Number(row.cnt);
    }

    // 6. Agrupar ml_events por event_code
    const eventCodeAgg = await this.dataSource.query(`
      SELECT event_code, COUNT(*) as cnt
      FROM ml_events
      GROUP BY event_code
    `);
    const byEventCode: Record<string, number> = {};
    for (const row of eventCodeAgg) {
      byEventCode[row.event_code] = Number(row.cnt);
    }

    // 7. Verificar conversión: predicciones con/sin evento asociado
    const predictionsWithEvent = await this.dataSource.query(`
      SELECT COUNT(DISTINCT p.id) as cnt
      FROM predictions p
      INNER JOIN ml_events e ON e.prediction_id = p.id
    `);
    const withEvent = Number(predictionsWithEvent[0]?.cnt ?? 0);
    const withoutEvent = totalPredictions - withEvent;

    // 8. Identificar problemas
    if (totalPredictions > 0 && totalMlEvents === 0) {
      issues.push('🚨 CRÍTICO: Hay predicciones pero CERO eventos ML. El pipeline de conversión NO está funcionando.');
      recommendations.push('Ejecutar convertPredictionsToEvents() para procesar predicciones pendientes.');
    }

    if (withoutEvent > 0) {
      issues.push(`⚠️ ${withoutEvent} predicciones no tienen evento ML asociado.`);
      recommendations.push('Revisar criterios de conversión o ejecutar conversión manual.');
    }

    if (anomalies > 0 && !byEventCode[MlEventCode.ANOMALY_DETECTED]) {
      issues.push(`⚠️ Hay ${anomalies} anomalías detectadas pero ningún evento ANOMALY_DETECTED.`);
      recommendations.push('Las anomalías deberían generar eventos ML automáticamente.');
    }

    const highRiskCount = (byRiskLevel['high'] ?? 0) + (byRiskLevel['critical'] ?? 0);
    if (highRiskCount > 0 && !byEventCode[MlEventCode.HIGH_RISK]) {
      issues.push(`⚠️ Hay ${highRiskCount} predicciones de alto riesgo pero ningún evento HIGH_RISK.`);
    }

    if (issues.length === 0) {
      issues.push('✅ Pipeline ML funcionando correctamente.');
    }

    const conversionRate = totalPredictions > 0 
      ? ((withEvent / totalPredictions) * 100).toFixed(1) + '%'
      : 'N/A';

    return {
      timestamp: new Date().toISOString(),
      predictions: {
        total: totalPredictions,
        withFutureTarget: predictionsWithFutureTarget,
        withPastTarget: predictionsWithPastTarget,
        byRiskLevel,
        bySeverity,
        byAnomaly: { anomalies, normal },
      },
      mlEvents: {
        total: totalMlEvents,
        active: activeEvents,
        acknowledged: acknowledgedEvents,
        resolved: resolvedEvents,
        byEventCode,
      },
      conversion: {
        predictionsWithoutEvent: withoutEvent,
        predictionsWithEvent: withEvent,
        conversionRate,
      },
      issues,
      recommendations,
    };
  }

  /**
   * CONVERTIR PREDICCIONES A EVENTOS ML
   * Procesa predicciones que deberían generar eventos pero no lo han hecho.
   */
  async convertPredictionsToEvents(options?: {
    limit?: number;
    onlyAnomalies?: boolean;
    onlyHighRisk?: boolean;
    dryRun?: boolean;
  }): Promise<ConversionResult> {
    const limit = options?.limit ?? 100;
    const dryRun = options?.dryRun ?? false;

    const result: ConversionResult = {
      processed: 0,
      created: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    // Buscar predicciones sin evento ML asociado
    let query = this.predictionRepo
      .createQueryBuilder('p')
      .leftJoin('ml_events', 'e', 'e.prediction_id = p.id')
      .leftJoinAndSelect('p.sensor', 'sensor')
      .leftJoinAndSelect('sensor.device', 'device')
      .leftJoinAndSelect('p.model', 'model')
      .where('e.id IS NULL'); // Sin evento asociado

    if (options?.onlyAnomalies) {
      query = query.andWhere('p.is_anomaly = 1');
    }

    if (options?.onlyHighRisk) {
      query = query.andWhere("p.risk_level IN ('high', 'critical')");
    }

    query = query.orderBy('p.predicted_at', 'DESC').limit(limit);

    const predictions = await query.getMany();
    result.processed = predictions.length;

    for (const pred of predictions) {
      try {
        // Determinar si esta predicción merece un evento
        const eventInfo = await this.evaluatePredictionForEvent(pred);

        if (!eventInfo.shouldCreate) {
          result.skipped++;
          result.details.push({
            predictionId: pred.id,
            action: 'skipped',
            reason: eventInfo.reason,
          });
          continue;
        }

        if (dryRun) {
          result.created++;
          result.details.push({
            predictionId: pred.id,
            action: 'created',
            reason: `[DRY RUN] Would create ${eventInfo.eventCode} event`,
          });
          continue;
        }

        // Crear el evento ML
        const event = await this.createMlEventFromPrediction(pred, eventInfo);
        result.created++;
        result.details.push({
          predictionId: pred.id,
          action: 'created',
          eventId: event.id,
          reason: `Created ${eventInfo.eventCode} event`,
        });

      } catch (err) {
        const errMsg = (err as Error).message;
        result.errors.push(`Prediction ${pred.id}: ${errMsg}`);
        result.details.push({
          predictionId: pred.id,
          action: 'error',
          reason: errMsg,
        });
      }
    }

    this.logger.log(`Conversion complete: ${result.created} created, ${result.skipped} skipped, ${result.errors.length} errors`);
    return result;
  }

  /**
   * Evalúa si una predicción debe generar un evento ML
   */
  private async evaluatePredictionForEvent(pred: Prediction): Promise<{
    shouldCreate: boolean;
    eventCode?: MlEventCode;
    eventType?: MlEventType;
    reason: string;
  }> {
    // 1. Anomalía detectada → ANOMALY_DETECTED
    if (pred.isAnomaly === 1) {
      return {
        shouldCreate: true,
        eventCode: MlEventCode.ANOMALY_DETECTED,
        eventType: MlEventType.WARNING,
        reason: 'Anomaly detected by ML model',
      };
    }

    // 2. Riesgo alto/crítico → HIGH_RISK
    if (pred.riskLevel === 'high' || pred.riskLevel === 'critical') {
      return {
        shouldCreate: true,
        eventCode: MlEventCode.HIGH_RISK,
        eventType: pred.riskLevel === 'critical' ? MlEventType.CRITICAL : MlEventType.WARNING,
        reason: `High risk level: ${pred.riskLevel}`,
      };
    }

    // 3. Severidad warning/critical → evento correspondiente
    if (pred.severity === 'critical' || pred.severity === 'warning') {
      return {
        shouldCreate: true,
        eventCode: MlEventCode.PRED_THRESHOLD_BREACH,
        eventType: pred.severity === 'critical' ? MlEventType.CRITICAL : MlEventType.WARNING,
        reason: `Prediction severity: ${pred.severity}`,
      };
    }

    // 4. Verificar si el valor predicho cruza umbrales
    if (pred.sensor) {
      const thresholds = await this.thresholdRepo.find({
        where: { sensor: { id: pred.sensor.id } },
      });

      const predValue = Number(pred.predictedValue);
      for (const th of thresholds) {
        const min = th.thresholdValueMin !== null ? Number(th.thresholdValueMin) : null;
        const max = th.thresholdValueMax !== null ? Number(th.thresholdValueMax) : null;

        const breachesMin = min !== null && predValue < min;
        const breachesMax = max !== null && predValue > max;

        if (breachesMin || breachesMax) {
          return {
            shouldCreate: true,
            eventCode: MlEventCode.PRED_THRESHOLD_BREACH,
            eventType: th.severity === 'critical' ? MlEventType.CRITICAL : MlEventType.WARNING,
            reason: `Predicted value ${predValue} breaches ${th.severity} threshold`,
          };
        }
      }
    }

    // 5. Tendencia peligrosa
    if (pred.trend === 'up' || pred.trend === 'down') {
      // Solo alertar si la tendencia es significativa (confianza > 0.7)
      const confidence = Number(pred.confidence);
      if (confidence > 0.7) {
        return {
          shouldCreate: true,
          eventCode: MlEventCode.TREND_ALERT,
          eventType: MlEventType.NOTICE,
          reason: `Significant trend detected: ${pred.trend} (confidence: ${confidence})`,
        };
      }
    }

    // No cumple criterios para evento
    return {
      shouldCreate: false,
      reason: 'Prediction does not meet criteria for ML event',
    };
  }

  /**
   * Crea un evento ML a partir de una predicción
   */
  private async createMlEventFromPrediction(
    pred: Prediction,
    eventInfo: { eventCode?: MlEventCode; eventType?: MlEventType; reason: string },
  ): Promise<MlEvent> {
    const sensorName = pred.sensor?.name ?? 'Unknown Sensor';
    const deviceId = pred.sensor?.device?.id ?? pred.device?.id;

    if (!deviceId) {
      throw new Error('Cannot create event: no device associated with prediction');
    }

    const title = this.generateEventTitle(eventInfo.eventCode!, sensorName);
    const message = this.generateEventMessage(pred, eventInfo);

    const payload = JSON.stringify({
      predictionId: pred.id,
      predictedValue: pred.predictedValue,
      confidence: pred.confidence,
      targetTimestamp: pred.targetTimestamp,
      trend: pred.trend,
      isAnomaly: pred.isAnomaly,
      anomalyScore: pred.anomalyScore,
      riskLevel: pred.riskLevel,
      modelName: pred.model?.modelName,
      reason: eventInfo.reason,
    });

    const event = this.mlEventRepo.create({
      deviceId: deviceId,
      sensorId: pred.sensor?.id ?? null,
      predictionId: pred.id,
      eventType: eventInfo.eventType!,
      eventCode: eventInfo.eventCode!,
      title,
      message,
      status: 'active',
      payload,
    });

    return this.mlEventRepo.save(event);
  }

  /**
   * Genera título para el evento
   */
  private generateEventTitle(eventCode: MlEventCode, sensorName: string): string {
    switch (eventCode) {
      case MlEventCode.ANOMALY_DETECTED:
        return `Anomalía Detectada - ${sensorName}`;
      case MlEventCode.HIGH_RISK:
        return `Riesgo Alto - ${sensorName}`;
      case MlEventCode.PRED_THRESHOLD_BREACH:
        return `Predicción de Umbral - ${sensorName}`;
      case MlEventCode.TREND_ALERT:
        return `Tendencia Detectada - ${sensorName}`;
      case MlEventCode.LOW_CONFIDENCE:
        return `Baja Confianza - ${sensorName}`;
      default:
        return `Evento ML - ${sensorName}`;
    }
  }

  /**
   * Genera mensaje descriptivo para el evento
   */
  private generateEventMessage(
    pred: Prediction,
    eventInfo: { eventCode?: MlEventCode; eventType?: MlEventType; reason: string },
  ): string {
    const predValue = Number(pred.predictedValue).toFixed(2);
    const confidence = (Number(pred.confidence) * 100).toFixed(0);
    const targetTime = pred.targetTimestamp?.toISOString?.() ?? 'N/A';

    let msg = `Predicción: ${predValue} (confianza: ${confidence}%). `;
    msg += `Objetivo: ${targetTime}. `;
    msg += eventInfo.reason;

    if (pred.explanation) {
      msg += ` Explicación: ${pred.explanation}`;
    }

    return msg;
  }

  /**
   * Obtiene estadísticas del modelo ML
   */
  async getModelStats(): Promise<{
    totalPredictions: number;
    recentPredictions: number;
    avgConfidence: number;
    anomalyRate: number;
    predictionsByModel: Array<{ modelName: string; count: number; avgConfidence: number }>;
  }> {
    const total = await this.predictionRepo.count();
    
    const recent = await this.predictionRepo
      .createQueryBuilder('p')
      .where('p.predicted_at > DATEADD(hour, -24, GETDATE())')
      .getCount();

    const avgConfidenceResult = await this.dataSource.query(`
      SELECT AVG(CAST(confidence AS FLOAT)) as avg_conf
      FROM predictions
      WHERE predicted_at > DATEADD(day, -7, GETDATE())
    `);
    const avgConfidence = Number(avgConfidenceResult[0]?.avg_conf ?? 0);

    const anomalyResult = await this.dataSource.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) as anomalies
      FROM predictions
      WHERE predicted_at > DATEADD(day, -7, GETDATE())
    `);
    const anomalyRate = anomalyResult[0]?.total > 0
      ? (anomalyResult[0].anomalies / anomalyResult[0].total)
      : 0;

    const byModel = await this.dataSource.query(`
      SELECT 
        COALESCE(m.model_name, 'Unknown') as model_name,
        COUNT(*) as cnt,
        AVG(CAST(p.confidence AS FLOAT)) as avg_conf
      FROM predictions p
      LEFT JOIN ml_models m ON p.model_id = m.id
      GROUP BY m.model_name
      ORDER BY cnt DESC
    `);

    return {
      totalPredictions: total,
      recentPredictions: recent,
      avgConfidence,
      anomalyRate,
      predictionsByModel: byModel.map((r: any) => ({
        modelName: r.model_name,
        count: Number(r.cnt),
        avgConfidence: Number(r.avg_conf ?? 0),
      })),
    };
  }

  /**
   * DIAGNÓSTICO DETALLADO DEL MODELO ML
   * 
   * Proporciona métricas de calidad del modelo incluyendo:
   * - Margen de error (MAE, RMSE)
   * - Desviación estándar de predicciones
   * - Tasa de acierto por umbral
   * - Estado de salud del modelo
   * - Patrones detectados y su clasificación
   * - Sensibilidad a micro-cambios
   * - Lo que el modelo está ignorando y por qué
   * 
   * ISO 27001: Este endpoint NO expone datos sensibles,
   * solo métricas agregadas de rendimiento.
   */
  async getModelDiagnostic(): Promise<{
    timestamp: string;
    modelHealth: 'healthy' | 'degraded' | 'critical' | 'unknown';
    healthScore: number;
    errorMetrics: {
      mae: number | null;
      rmse: number | null;
      mape: number | null;
      stdDev: number | null;
      sampleSize: number;
    };
    predictionQuality: {
      avgConfidence: number;
      lowConfidenceRate: number;
      highConfidenceRate: number;
      confidenceDistribution: Record<string, number>;
    };
    accuracyMetrics: {
      withinThreshold5pct: number;
      withinThreshold10pct: number;
      withinThreshold20pct: number;
      totalEvaluated: number;
    };
    modelActivity: {
      predictionsLast1h: number;
      predictionsLast24h: number;
      predictionsLast7d: number;
      avgPredictionsPerHour: number;
    };
    anomalyDetection: {
      totalAnomalies: number;
      anomalyRate: number;
      falsePositiveEstimate: number | null;
    };
    // NUEVAS MÉTRICAS: Patrones y sensibilidad
    patternAnalysis: {
      patternsDetected: Array<{
        patternType: string;
        count: number;
        description: string;
      }>;
      dominantPattern: string | null;
      patternDiversity: number;
    };
    microDeltaSensitivity: {
      totalChanges: number;
      microChanges: number;
      microChangeRate: number;
      sensitivityThreshold: number;
      ignoredChangesCount: number;
    };
    ignoredDataReasons: Array<{
      reason: string;
      count: number;
      description: string;
    }>;
    errorMarginAnalysis: {
      estimatedMarginPct: number;
      marginConfidence: number;
      isReliable: boolean;
      explanation: string;
    };
    recommendations: string[];
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // 1. Métricas de error (comparando predicciones con lecturas reales)
    const errorMetricsResult = await this.dataSource.query(`
      WITH PredictionAccuracy AS (
        SELECT 
          p.id,
          p.predicted_value,
          p.target_timestamp,
          p.confidence,
          sr.value as actual_value,
          ABS(CAST(p.predicted_value AS FLOAT) - CAST(sr.value AS FLOAT)) as abs_error,
          POWER(CAST(p.predicted_value AS FLOAT) - CAST(sr.value AS FLOAT), 2) as squared_error,
          CASE 
            WHEN CAST(sr.value AS FLOAT) != 0 
            THEN ABS(CAST(p.predicted_value AS FLOAT) - CAST(sr.value AS FLOAT)) / ABS(CAST(sr.value AS FLOAT)) * 100
            ELSE NULL 
          END as pct_error
        FROM predictions p
        INNER JOIN sensor_readings sr ON p.sensor_id = sr.sensor_id
          AND sr.timestamp BETWEEN DATEADD(minute, -5, p.target_timestamp) 
                               AND DATEADD(minute, 5, p.target_timestamp)
        WHERE p.predicted_at > DATEADD(day, -7, GETDATE())
      )
      SELECT 
        COUNT(*) as sample_size,
        AVG(abs_error) as mae,
        SQRT(AVG(squared_error)) as rmse,
        AVG(pct_error) as mape,
        STDEV(abs_error) as std_dev
      FROM PredictionAccuracy
    `);

    const mae = errorMetricsResult[0]?.mae != null ? Number(errorMetricsResult[0].mae) : null;
    const rmse = errorMetricsResult[0]?.rmse != null ? Number(errorMetricsResult[0].rmse) : null;
    const mape = errorMetricsResult[0]?.mape != null ? Number(errorMetricsResult[0].mape) : null;
    const stdDev = errorMetricsResult[0]?.std_dev != null ? Number(errorMetricsResult[0].std_dev) : null;
    const sampleSize = Number(errorMetricsResult[0]?.sample_size ?? 0);

    // 2. Calidad de predicciones por confianza
    const confidenceResult = await this.dataSource.query(`
      SELECT 
        AVG(CAST(confidence AS FLOAT)) as avg_conf,
        SUM(CASE WHEN confidence < 0.5 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as low_conf_rate,
        SUM(CASE WHEN confidence >= 0.8 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as high_conf_rate,
        SUM(CASE WHEN confidence < 0.3 THEN 1 ELSE 0 END) as conf_0_30,
        SUM(CASE WHEN confidence >= 0.3 AND confidence < 0.5 THEN 1 ELSE 0 END) as conf_30_50,
        SUM(CASE WHEN confidence >= 0.5 AND confidence < 0.7 THEN 1 ELSE 0 END) as conf_50_70,
        SUM(CASE WHEN confidence >= 0.7 AND confidence < 0.9 THEN 1 ELSE 0 END) as conf_70_90,
        SUM(CASE WHEN confidence >= 0.9 THEN 1 ELSE 0 END) as conf_90_100
      FROM predictions
      WHERE predicted_at > DATEADD(day, -7, GETDATE())
    `);

    const avgConfidence = Number(confidenceResult[0]?.avg_conf ?? 0);
    const lowConfidenceRate = Number(confidenceResult[0]?.low_conf_rate ?? 0);
    const highConfidenceRate = Number(confidenceResult[0]?.high_conf_rate ?? 0);

    // 3. Precisión por umbral
    const accuracyResult = await this.dataSource.query(`
      WITH PredictionAccuracy AS (
        SELECT 
          p.predicted_value,
          sr.value as actual_value,
          CASE 
            WHEN CAST(sr.value AS FLOAT) != 0 
            THEN ABS(CAST(p.predicted_value AS FLOAT) - CAST(sr.value AS FLOAT)) / ABS(CAST(sr.value AS FLOAT)) * 100
            ELSE 0 
          END as pct_error
        FROM predictions p
        INNER JOIN sensor_readings sr ON p.sensor_id = sr.sensor_id
          AND sr.timestamp BETWEEN DATEADD(minute, -5, p.target_timestamp) 
                               AND DATEADD(minute, 5, p.target_timestamp)
        WHERE p.predicted_at > DATEADD(day, -7, GETDATE())
      )
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN pct_error <= 5 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as within_5pct,
        SUM(CASE WHEN pct_error <= 10 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as within_10pct,
        SUM(CASE WHEN pct_error <= 20 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as within_20pct
      FROM PredictionAccuracy
    `);

    // 4. Actividad del modelo
    const activityResult = await this.dataSource.query(`
      SELECT 
        SUM(CASE WHEN predicted_at > DATEADD(hour, -1, GETDATE()) THEN 1 ELSE 0 END) as last_1h,
        SUM(CASE WHEN predicted_at > DATEADD(hour, -24, GETDATE()) THEN 1 ELSE 0 END) as last_24h,
        SUM(CASE WHEN predicted_at > DATEADD(day, -7, GETDATE()) THEN 1 ELSE 0 END) as last_7d
      FROM predictions
    `);

    const predictionsLast1h = Number(activityResult[0]?.last_1h ?? 0);
    const predictionsLast24h = Number(activityResult[0]?.last_24h ?? 0);
    const predictionsLast7d = Number(activityResult[0]?.last_7d ?? 0);
    const avgPredictionsPerHour = predictionsLast7d / (7 * 24);

    // 5. Detección de anomalías
    const anomalyResult = await this.dataSource.query(`
      SELECT 
        SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) as total_anomalies,
        COUNT(*) as total,
        SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) as anomaly_rate
      FROM predictions
      WHERE predicted_at > DATEADD(day, -7, GETDATE())
    `);

    const totalAnomalies = Number(anomalyResult[0]?.total_anomalies ?? 0);
    const anomalyRate = Number(anomalyResult[0]?.anomaly_rate ?? 0);

    // 6. Calcular health score y estado
    let healthScore = 100;
    
    if (sampleSize === 0) {
      warnings.push('⚠️ No hay datos suficientes para evaluar precisión del modelo');
      healthScore -= 30;
    } else {
      if (mape !== null && mape > 20) {
        warnings.push(`⚠️ Error porcentual alto: ${mape.toFixed(1)}% (umbral: 20%)`);
        healthScore -= Math.min(30, mape - 20);
      }
      if (mae !== null && stdDev !== null && stdDev > mae * 2) {
        warnings.push('⚠️ Alta variabilidad en errores - modelo inconsistente');
        healthScore -= 15;
      }
    }

    if (lowConfidenceRate > 30) {
      warnings.push(`⚠️ ${lowConfidenceRate.toFixed(0)}% de predicciones con baja confianza`);
      healthScore -= 10;
    }

    if (predictionsLast1h === 0 && predictionsLast24h > 0) {
      warnings.push('⚠️ Sin predicciones en la última hora - verificar pipeline');
      healthScore -= 20;
    }

    if (anomalyRate > 10) {
      warnings.push(`⚠️ Tasa de anomalías alta: ${anomalyRate.toFixed(1)}%`);
      recommendations.push('Revisar umbrales de detección de anomalías');
    }

    // Recomendaciones basadas en métricas
    if (avgConfidence < 0.6) {
      recommendations.push('Considerar aumentar ventana de datos para mejorar confianza');
    }
    if (sampleSize < 100) {
      recommendations.push('Acumular más datos para evaluación estadística robusta');
    }
    if (healthScore >= 80) {
      recommendations.push('✅ Modelo funcionando dentro de parámetros normales');
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    let modelHealth: 'healthy' | 'degraded' | 'critical' | 'unknown';
    if (sampleSize === 0 && predictionsLast7d === 0) {
      modelHealth = 'unknown';
    } else if (healthScore >= 80) {
      modelHealth = 'healthy';
    } else if (healthScore >= 50) {
      modelHealth = 'degraded';
    } else {
      modelHealth = 'critical';
    }

    // 7. Análisis de patrones detectados
    const patternResult = await this.dataSource.query(`
      WITH RecentReadings AS (
        SELECT 
          sr.sensor_id,
          sr.value,
          LAG(sr.value) OVER (PARTITION BY sr.sensor_id ORDER BY sr.timestamp) as prev_value,
          sr.timestamp
        FROM sensor_readings sr
        WHERE sr.timestamp > DATEADD(hour, -24, GETDATE())
      ),
      DeltaAnalysis AS (
        SELECT 
          sensor_id,
          value,
          prev_value,
          ABS(CAST(value AS FLOAT) - CAST(prev_value AS FLOAT)) as delta,
          CASE 
            WHEN prev_value IS NOT NULL AND CAST(prev_value AS FLOAT) != 0 
            THEN ABS(CAST(value AS FLOAT) - CAST(prev_value AS FLOAT)) / ABS(CAST(prev_value AS FLOAT))
            ELSE 0 
          END as delta_pct
        FROM RecentReadings
        WHERE prev_value IS NOT NULL
      )
      SELECT 
        COUNT(*) as total_changes,
        SUM(CASE WHEN delta_pct < 0.01 THEN 1 ELSE 0 END) as micro_changes,
        SUM(CASE WHEN delta_pct >= 0.01 AND delta_pct < 0.05 THEN 1 ELSE 0 END) as small_changes,
        SUM(CASE WHEN delta_pct >= 0.05 AND delta_pct < 0.10 THEN 1 ELSE 0 END) as medium_changes,
        SUM(CASE WHEN delta_pct >= 0.10 THEN 1 ELSE 0 END) as large_changes,
        AVG(delta_pct) * 100 as avg_delta_pct,
        MAX(delta_pct) * 100 as max_delta_pct
      FROM DeltaAnalysis
    `);

    const totalChanges = Number(patternResult[0]?.total_changes ?? 0);
    const microChanges = Number(patternResult[0]?.micro_changes ?? 0);
    const smallChanges = Number(patternResult[0]?.small_changes ?? 0);
    const mediumChanges = Number(patternResult[0]?.medium_changes ?? 0);
    const largeChanges = Number(patternResult[0]?.large_changes ?? 0);
    const avgDeltaPct = Number(patternResult[0]?.avg_delta_pct ?? 0);
    const maxDeltaPct = Number(patternResult[0]?.max_delta_pct ?? 0);

    // Clasificar patrones detectados
    const patternsDetected: Array<{ patternType: string; count: number; description: string }> = [];
    
    if (microChanges > 0) {
      patternsDetected.push({
        patternType: 'micro_variation',
        count: microChanges,
        description: `Micro-variaciones (<1%): ${microChanges} cambios detectados pero no afectan predicción`,
      });
    }
    if (smallChanges > 0) {
      patternsDetected.push({
        patternType: 'small_change',
        count: smallChanges,
        description: `Cambios pequeños (1-5%): ${smallChanges} cambios dentro de tolerancia normal`,
      });
    }
    if (mediumChanges > 0) {
      patternsDetected.push({
        patternType: 'medium_change',
        count: mediumChanges,
        description: `Cambios moderados (5-10%): ${mediumChanges} cambios significativos`,
      });
    }
    if (largeChanges > 0) {
      patternsDetected.push({
        patternType: 'spike',
        count: largeChanges,
        description: `Spikes (>10%): ${largeChanges} cambios bruscos detectados`,
      });
    }

    // Determinar patrón dominante
    let dominantPattern: string | null = null;
    if (totalChanges > 0) {
      const microRate = microChanges / totalChanges;
      const largeRate = largeChanges / totalChanges;
      
      if (microRate > 0.7) {
        dominantPattern = 'stable';
        patternsDetected.unshift({
          patternType: 'stable',
          count: totalChanges,
          description: 'Sistema estable: mayoría de cambios son micro-variaciones',
        });
      } else if (largeRate > 0.3) {
        dominantPattern = 'volatile';
        patternsDetected.unshift({
          patternType: 'volatile',
          count: largeChanges,
          description: 'Sistema volátil: alta frecuencia de cambios bruscos',
        });
      } else {
        dominantPattern = 'normal';
        patternsDetected.unshift({
          patternType: 'normal',
          count: totalChanges,
          description: 'Comportamiento normal: mezcla de variaciones',
        });
      }
    }

    // Diversidad de patrones (0-1, mayor = más diverso)
    const patternDiversity = patternsDetected.length > 0 
      ? Math.min(1, patternsDetected.length / 5) 
      : 0;

    // 8. Análisis de micro-deltas y sensibilidad
    const microChangeRate = totalChanges > 0 ? (microChanges / totalChanges) * 100 : 0;
    const sensitivityThreshold = 1.0; // 1% es el umbral de micro-cambio

    // 9. Razones de datos ignorados
    const ignoredDataReasons: Array<{ reason: string; count: number; description: string }> = [];
    
    if (microChanges > 0) {
      ignoredDataReasons.push({
        reason: 'micro_variation_below_threshold',
        count: microChanges,
        description: `${microChanges} cambios menores a ${sensitivityThreshold}% no afectan la predicción`,
      });
    }

    // Contar valores repetidos
    const repeatedResult = await this.dataSource.query(`
      WITH RecentReadings AS (
        SELECT 
          value,
          LAG(value) OVER (ORDER BY timestamp) as prev_value
        FROM sensor_readings
        WHERE timestamp > DATEADD(hour, -24, GETDATE())
      )
      SELECT COUNT(*) as repeated_count
      FROM RecentReadings
      WHERE value = prev_value
    `);
    const repeatedCount = Number(repeatedResult[0]?.repeated_count ?? 0);
    
    if (repeatedCount > 0) {
      ignoredDataReasons.push({
        reason: 'repeated_values',
        count: repeatedCount,
        description: `${repeatedCount} valores idénticos consecutivos no aportan información nueva`,
      });
    }

    // Contar predicciones sin evento (dentro de rango normal)
    const withinRangeResult = await this.dataSource.query(`
      SELECT COUNT(*) as within_range
      FROM predictions p
      WHERE p.predicted_at > DATEADD(day, -1, GETDATE())
        AND NOT EXISTS (
          SELECT 1 FROM ml_events e 
          WHERE e.prediction_id = p.id
        )
    `);
    const withinRangeCount = Number(withinRangeResult[0]?.within_range ?? 0);
    
    if (withinRangeCount > 0) {
      ignoredDataReasons.push({
        reason: 'within_normal_range',
        count: withinRangeCount,
        description: `${withinRangeCount} predicciones dentro del rango normal (no generan eventos)`,
      });
    }

    // 10. Análisis de margen de error
    const marginConfidence = sampleSize >= 30 ? 0.95 : sampleSize >= 10 ? 0.7 : 0.3;
    const estimatedMarginPct = mape !== null ? mape : (stdDev !== null && mae !== null ? (stdDev / mae) * 100 : 0);
    const isReliable = sampleSize >= 10 && marginConfidence >= 0.7;
    
    let marginExplanation = '';
    if (sampleSize === 0) {
      marginExplanation = 'Sin datos suficientes para calcular margen de error';
    } else if (isReliable) {
      marginExplanation = `Margen de error ±${estimatedMarginPct.toFixed(1)}% basado en ${sampleSize} muestras (confianza ${(marginConfidence * 100).toFixed(0)}%)`;
    } else {
      marginExplanation = `Margen estimado ±${estimatedMarginPct.toFixed(1)}% - se requieren más datos para mayor confianza`;
    }

    // Agregar warnings sobre micro-cambios si es relevante
    if (microChangeRate > 70) {
      warnings.push(`⚠️ ${microChangeRate.toFixed(0)}% de cambios son micro-variaciones - el modelo puede parecer "insensible"`);
      recommendations.push('Los micro-cambios (<1%) no afectan la predicción por diseño. Esto es comportamiento esperado para sensores estables.');
    }

    if (avgDeltaPct < 1 && totalChanges > 100) {
      recommendations.push('Sistema muy estable: considerar ajustar umbrales de alerta si se requiere mayor sensibilidad');
    }

    return {
      timestamp: new Date().toISOString(),
      modelHealth,
      healthScore,
      errorMetrics: {
        mae,
        rmse,
        mape,
        stdDev,
        sampleSize,
      },
      predictionQuality: {
        avgConfidence,
        lowConfidenceRate,
        highConfidenceRate,
        confidenceDistribution: {
          '0-30%': Number(confidenceResult[0]?.conf_0_30 ?? 0),
          '30-50%': Number(confidenceResult[0]?.conf_30_50 ?? 0),
          '50-70%': Number(confidenceResult[0]?.conf_50_70 ?? 0),
          '70-90%': Number(confidenceResult[0]?.conf_70_90 ?? 0),
          '90-100%': Number(confidenceResult[0]?.conf_90_100 ?? 0),
        },
      },
      accuracyMetrics: {
        withinThreshold5pct: Number(accuracyResult[0]?.within_5pct ?? 0),
        withinThreshold10pct: Number(accuracyResult[0]?.within_10pct ?? 0),
        withinThreshold20pct: Number(accuracyResult[0]?.within_20pct ?? 0),
        totalEvaluated: Number(accuracyResult[0]?.total ?? 0),
      },
      modelActivity: {
        predictionsLast1h,
        predictionsLast24h,
        predictionsLast7d,
        avgPredictionsPerHour: Number(avgPredictionsPerHour.toFixed(2)),
      },
      anomalyDetection: {
        totalAnomalies,
        anomalyRate,
        falsePositiveEstimate: null,
      },
      // NUEVAS MÉTRICAS
      patternAnalysis: {
        patternsDetected,
        dominantPattern,
        patternDiversity,
      },
      microDeltaSensitivity: {
        totalChanges,
        microChanges,
        microChangeRate: Number(microChangeRate.toFixed(2)),
        sensitivityThreshold,
        ignoredChangesCount: microChanges + repeatedCount,
      },
      ignoredDataReasons,
      errorMarginAnalysis: {
        estimatedMarginPct: Number(estimatedMarginPct.toFixed(2)),
        marginConfidence,
        isReliable,
        explanation: marginExplanation,
      },
      recommendations,
      warnings,
    };
  }
}
