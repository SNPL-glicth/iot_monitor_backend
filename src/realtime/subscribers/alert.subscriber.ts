import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { Alert } from '../../entities/alert.entity';
import { RealtimeEventBus } from '../realtime-event-bus.service';

@EventSubscriber()
export class AlertSubscriber implements EntitySubscriberInterface<Alert> {
  constructor(private readonly eventBus: RealtimeEventBus) {}

  listenTo() {
    return Alert;
  }

  afterInsert(event: InsertEvent<Alert>): void {
    this.emit(event.entity);
  }

  afterUpdate(event: UpdateEvent<Alert>): void {
    if (event.entity) {
      this.emit(event.entity as Alert);
    }
  }

  private emit(alert: Alert): void {
    this.eventBus.emitAlert({
      id: alert.id,
      sensorId: alert.sensorId,
      deviceId: alert.deviceId,
      severity: alert.severity,
      status: alert.status,
      triggeredValue: alert.triggeredValue,
      triggeredAt: alert.triggeredAt,
    });
  }
}
