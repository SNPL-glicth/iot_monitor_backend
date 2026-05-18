import { Test, TestingModule } from '@nestjs/testing';
import { SensorQueryService } from './sensor-query.service';
import { MonitoringService } from './monitoring.service';

const mockMonitoringService = () => ({
  getDevicesWithSensors: jest.fn(),
  getDeviceById: jest.fn(),
  getLatestSensorReadings: jest.fn(),
  getActiveAlerts: jest.fn(),
  getActiveMlEvents: jest.fn(),
  getAllSensorsConsolidatedStatus: jest.fn(),
  getLatestPredictions: jest.fn(),
  getSensorReadings: jest.fn(),
  getSensorConsolidatedStatus: jest.fn(),
  getSensorConsolidatedStatusBatch: jest.fn(),
  insertSensorReading: jest.fn(),
  getMlHealth: jest.fn(),
  deleteSensor: jest.fn(),
  getSensorAlertsHistory: jest.fn(),
});

describe('SensorQueryService', () => {
  let service: SensorQueryService;
  let monitoring: ReturnType<typeof mockMonitoringService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SensorQueryService,
        { provide: MonitoringService, useFactory: mockMonitoringService },
      ],
    }).compile();

    service = module.get<SensorQueryService>(SensorQueryService);
    monitoring = module.get(MonitoringService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('delega getDevicesWithSensors al MonitoringService', async () => {
    const expected = [{ id: '1', name: 'Device 1' }];
    monitoring.getDevicesWithSensors.mockResolvedValue(expected);
    const result = await service.getDevicesWithSensors();
    expect(monitoring.getDevicesWithSensors).toHaveBeenCalled();
    expect(result).toEqual(expected);
  });

  it('delega getDeviceById con el id correcto', async () => {
    const expected = { id: '1', name: 'Device 1' };
    monitoring.getDeviceById.mockResolvedValue(expected);
    const result = await service.getDeviceById(1);
    expect(monitoring.getDeviceById).toHaveBeenCalledWith(1);
    expect(result).toEqual(expected);
  });

  it('delega getLatestSensorReadings', async () => {
    const expected = [{ sensorId: '1', value: 25 }];
    monitoring.getLatestSensorReadings.mockResolvedValue(expected);
    const result = await service.getLatestSensorReadings();
    expect(result).toEqual(expected);
  });

  it('delega getActiveAlerts con limite por defecto', async () => {
    const expected = [{ id: '1', severity: 'critical' }];
    monitoring.getActiveAlerts.mockResolvedValue(expected);
    const result = await service.getActiveAlerts();
    expect(monitoring.getActiveAlerts).toHaveBeenCalledWith(100);
    expect(result).toEqual(expected);
  });

  it('delega getActiveMlEvents con limite personalizado', async () => {
    const expected = [{ id: '1', eventType: 'anomaly' }];
    monitoring.getActiveMlEvents.mockResolvedValue(expected);
    const result = await service.getActiveMlEvents(25);
    expect(monitoring.getActiveMlEvents).toHaveBeenCalledWith(25);
    expect(result).toEqual(expected);
  });

  it('delega deleteSensor con el id correcto', async () => {
    monitoring.deleteSensor.mockResolvedValue({ success: true });
    const result = await service.deleteSensor(123);
    expect(monitoring.deleteSensor).toHaveBeenCalledWith(123);
    expect(result).toEqual({ success: true });
  });

  it('delega insertSensorReading con sensorId y value', async () => {
    monitoring.insertSensorReading.mockResolvedValue(undefined);
    await service.insertSensorReading(123, 25.5);
    expect(monitoring.insertSensorReading).toHaveBeenCalledWith(123, 25.5);
  });

  it('delega getSensorAlertsHistory con sensorId y limit', async () => {
    const expected = [{ id: '1' }];
    monitoring.getSensorAlertsHistory.mockResolvedValue(expected);
    const result = await service.getSensorAlertsHistory(123, 20);
    expect(monitoring.getSensorAlertsHistory).toHaveBeenCalledWith(123, 20);
    expect(result).toEqual(expected);
  });
});
