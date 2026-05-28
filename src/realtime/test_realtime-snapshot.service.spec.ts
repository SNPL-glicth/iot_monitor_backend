/// <reference types="jest" />
import { RealtimeSnapshotService } from './realtime-snapshot.service';

describe('RealtimeSnapshotService', () => {
  it('calls all 5 queries in parallel', async () => {
    const mockRepo = {
      getLatestSensorReadings: jest.fn().mockResolvedValue([]),
      getActiveAlerts: jest.fn().mockResolvedValue([]),
      getLatestPredictions: jest.fn().mockResolvedValue([]),
      getActiveMlEvents: jest.fn().mockResolvedValue([]),
      getAllSensorsConsolidatedStatus: jest.fn().mockResolvedValue([]),
    };
    const service = new RealtimeSnapshotService(mockRepo as any);
    await service.fetchSnapshot();
    expect(mockRepo.getLatestSensorReadings).toHaveBeenCalled();
    expect(mockRepo.getActiveAlerts).toHaveBeenCalled();
    expect(mockRepo.getLatestPredictions).toHaveBeenCalled();
    expect(mockRepo.getActiveMlEvents).toHaveBeenCalled();
    expect(mockRepo.getAllSensorsConsolidatedStatus).toHaveBeenCalled();
  });

  it('returns partial snapshot when one query fails', async () => {
    const mockRepo = {
      getLatestSensorReadings: jest.fn().mockResolvedValue([{ id: 1 }]),
      getActiveAlerts: jest.fn().mockRejectedValue(new Error('db down')),
      getLatestPredictions: jest.fn().mockResolvedValue([]),
      getActiveMlEvents: jest.fn().mockResolvedValue([]),
      getAllSensorsConsolidatedStatus: jest.fn().mockResolvedValue([]),
    };
    const service = new RealtimeSnapshotService(mockRepo as any);
    const snapshot = await service.fetchSnapshot();
    expect(snapshot.partial).toBe(true);
    expect(snapshot.readings).toEqual([{ id: 1 }]);
  });

  it('uses cached value for failed query', async () => {
    const mockRepo = {
      getLatestSensorReadings: jest.fn().mockResolvedValue([{ id: 1 }]),
      getActiveAlerts: jest.fn().mockRejectedValue(new Error('db down')),
      getLatestPredictions: jest.fn().mockResolvedValue([]),
      getActiveMlEvents: jest.fn().mockResolvedValue([]),
      getAllSensorsConsolidatedStatus: jest.fn().mockResolvedValue([]),
    };
    const service = new RealtimeSnapshotService(mockRepo as any);
    await service.fetchSnapshot();
    const second = await service.fetchSnapshot();
    expect(second.readings).toEqual([{ id: 1 }]);
  });
});
