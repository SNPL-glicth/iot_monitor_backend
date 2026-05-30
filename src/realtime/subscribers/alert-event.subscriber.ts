import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
} from 'typeorm';
import { AlertEvent } from '../../entities/alert-event.entity';
import { RealtimeEventBus } from '../realtime-event-bus.service';

@EventSubscriber()
export class AlertEventSubscriber implements EntitySubscriberInterface<AlertEvent> {
  constructor(private readonly eventBus: RealtimeEventBus) {}

  listenTo() {
    return AlertEvent;
  }

  afterInsert(event: InsertEvent<AlertEvent>): void {
    const e = event.entity;
    this.eventBus.emitMlEvent({
      id: e.id,
      sensorId: e.sensorId,
      deviceId: e.deviceId,
      eventType: e.eventType,
      eventSubtype: e.eventSubtype,
      severity: e.severity,
      triggeredValue: e.triggeredValue,
      triggeredAt: e.triggeredAt,
      status: e.status,
      title: e.title,
      message: e.message,
    });
  }
}
