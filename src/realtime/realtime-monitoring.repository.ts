import { Injectable } from '@nestjs/common';
import { MonitoringService } from '../monitoring/services/monitoring.service';

interface IMonitoringRepository {
  getLatestSensorReadings(): Promise<unknown[]>;
  getActiveAlerts(): Promise<unknown[]>;
  getLatestPredictions(limit: number): Promise<unknown[]>;
  getActiveMlEvents(limit: number): Promise<unknown[]>;
  getAllSensorsConsolidatedStatus(): Promise<unknown[]>;
}

export const MONITORING_REPOSITORY = 'MONITORING_REPOSITORY';

@Injectable()
export class MonitoringRepositoryAdapter implements IMonitoringRepository {
  constructor(private readonly monitoring: MonitoringService) {}

  getLatestSensorReadings(): Promise<unknown[]> {
    return this.monitoring.getLatestSensorReadings();
  }

  getActiveAlerts(): Promise<unknown[]> {
    return this.monitoring.getActiveAlerts(100);
  }

  getLatestPredictions(limit: number): Promise<unknown[]> {
    return this.monitoring.getLatestPredictions(limit);
  }

  getActiveMlEvents(limit: number): Promise<unknown[]> {
    return this.monitoring.getActiveMlEvents(limit);
  }

  getAllSensorsConsolidatedStatus(): Promise<unknown[]> {
    return this.monitoring.getAllSensorsConsolidatedStatus();
  }
}
