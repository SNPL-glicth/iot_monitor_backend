import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AlertEvent } from '../entities/alert-event.entity';
import { AlertEventsService } from './alert-events.service';
import { AlertEventsController } from './alert-events.controller';

/**
 * Módulo para historial de eventos de alerta.
 * 
 * Proporciona:
 * - Servicio para consultar historial de eventos
 * - Controller con endpoints REST
 * - Entidad AlertEvent para TypeORM
 */
@Module({
  imports: [TypeOrmModule.forFeature([AlertEvent])],
  controllers: [AlertEventsController],
  providers: [AlertEventsService],
  exports: [AlertEventsService],
})
export class AlertEventsModule {}
