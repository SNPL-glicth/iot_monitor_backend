import { Test, TestingModule } from '@nestjs/testing';
import { SensorThresholdService } from './sensor-threshold.service';
import { MonitoringService } from './monitoring.service';

const mockMonitoringService = () => ({
  getSensorThresholds: jest.fn(),
  createSensorThreshold: jest.fn(),
  updateThreshold: jest.fn(),
  deactivateThreshold: jest.fn(),
  getThresholdHistory: jest.fn(),
  getSensorThresholdsCanonical: jest.fn(),
  getSensorAlertsHistory: jest.fn(),
  getSensorThresholdProfile: jest.fn(),
  upsertSensorThresholdProfile: jest.fn(),
});

describe('SensorThresholdService', () => {
  let service: SensorThresholdService;
  let monitoring: ReturnType<typeof mockMonitoringService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SensorThresholdService,
        { provide: MonitoringService, useFactory: mockMonitoringService },
      ],
    }).compile();

    service = module.get<SensorThresholdService>(SensorThresholdService);
    monitoring = module.get(MonitoringService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('delega getSensorThresholds con sensorId', async () => {
    const expected = [{ id: '1', warningMin: 10, warningMax: 50 }];
    monitoring.getSensorThresholds.mockResolvedValue(expected);
    const result = await service.getSensorThresholds(123);
    expect(monitoring.getSensorThresholds).toHaveBeenCalledWith(123);
    expect(result).toEqual(expected);
  });

  it('delega createSensorThreshold con data', async () => {
    const data = { name: 'Temp Alert', conditionType: 'greater_than' as const, severity: 'warning' as const };
    monitoring.createSensorThreshold.mockResolvedValue({ id: '1', ...data });
    const result = await service.createSensorThreshold(123, data);
    expect(monitoring.createSensorThreshold).toHaveBeenCalledWith(123, data);
    expect(result.id).toBe('1');
  });

  it('delega updateThreshold con thresholdId, userId y data', async () => {
    const data = { thresholdValueMin: 10, thresholdValueMax: 50 };
    monitoring.updateThreshold.mockResolvedValue({ success: true });
    const result = await service.updateThreshold(1, 'user-1', data);
    expect(monitoring.updateThreshold).toHaveBeenCalledWith(1, 'user-1', data);
    expect(result.success).toBe(true);
  });

  it('delega deactivateThreshold con thresholdId, userId y reason', async () => {
    monitoring.deactivateThreshold.mockResolvedValue({ success: true });
    const result = await service.deactivateThreshold(1, 'user-1', 'obsolete');
    expect(monitoring.deactivateThreshold).toHaveBeenCalledWith(1, 'user-1', 'obsolete');
    expect(result.success).toBe(true);
  });

  it('delega getThresholdHistory con thresholdId', async () => {
    const expected = [{ id: '1', changedAt: new Date() }];
    monitoring.getThresholdHistory.mockResolvedValue(expected);
    const result = await service.getThresholdHistory(1);
    expect(monitoring.getThresholdHistory).toHaveBeenCalledWith(1);
    expect(result).toEqual(expected);
  });

  it('delega getSensorThresholdProfile con sensorId', async () => {
    const expected = { sensorId: '123', warningMin: 10, warningMax: 50 };
    monitoring.getSensorThresholdProfile.mockResolvedValue(expected);
    const result = await service.getSensorThresholdProfile(123);
    expect(monitoring.getSensorThresholdProfile).toHaveBeenCalledWith(123);
    expect(result).toEqual(expected);
  });

  it('delega upsertSensorThresholdProfile con sensorId y data', async () => {
    const data = { warningMin: 10, warningMax: 50 };
    monitoring.upsertSensorThresholdProfile.mockResolvedValue({ success: true });
    const result = await service.upsertSensorThresholdProfile(123, data);
    expect(monitoring.upsertSensorThresholdProfile).toHaveBeenCalledWith(123, data);
    expect(result.success).toBe(true);
  });
});
