import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeEventBus {
  private readonly logger = new Logger(RealtimeEventBus.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  emitReading(reading: unknown): void {
    this.gateway.broadcast('readings/latest', reading);
    this.logger.debug('broadcast reading');
  }

  emitAlert(alert: unknown): void {
    this.gateway.broadcast('alerts/active', alert);
    this.logger.debug('broadcast alert');
  }

  emitPrediction(prediction: unknown): void {
    this.gateway.broadcast('predictions/latest', prediction);
    this.logger.debug('broadcast prediction');
  }

  emitMlEvent(event: unknown): void {
    this.gateway.broadcast('ml/events/active', event);
    this.logger.debug('broadcast ml_event');
  }

  emitConsolidated(status: unknown): void {
    this.gateway.broadcast('sensors/consolidated', status);
    this.logger.debug('broadcast consolidated');
  }
}
