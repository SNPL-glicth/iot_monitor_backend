import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
} from 'typeorm';
import { SensorReading } from '../../entities/sensor-reading.entity';
import { RealtimeEventBus } from '../realtime-event-bus.service';

@EventSubscriber()
export class SensorReadingSubscriber implements EntitySubscriberInterface<SensorReading> {
  constructor(private readonly eventBus: RealtimeEventBus) {}

  listenTo() {
    return SensorReading;
  }

  afterInsert(event: InsertEvent<SensorReading>): void {
    const reading = event.entity;
    this.eventBus.emitReading({
      id: reading.id,
      sensorId: reading.sensorId,
      value: reading.value,
      timestamp: reading.timestamp,
    });
  }
}
