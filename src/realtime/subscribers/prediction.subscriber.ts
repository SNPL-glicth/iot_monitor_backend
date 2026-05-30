import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
} from 'typeorm';
import { Prediction } from '../../entities/prediction.entity';
import { RealtimeEventBus } from '../realtime-event-bus.service';

@EventSubscriber()
export class PredictionSubscriber implements EntitySubscriberInterface<Prediction> {
  constructor(private readonly eventBus: RealtimeEventBus) {}

  listenTo() {
    return Prediction;
  }

  afterInsert(event: InsertEvent<Prediction>): void {
    const p = event.entity;
    this.eventBus.emitPrediction({
      id: p.id,
      sensorId: p.sensor,
      predictedValue: p.predictedValue,
      confidence: p.confidence,
      predictedAt: p.predictedAt,
      targetTimestamp: p.targetTimestamp,
      trend: p.trend,
      isAnomaly: p.isAnomaly,
      riskLevel: p.riskLevel,
      severity: p.severity,
    });
  }
}
