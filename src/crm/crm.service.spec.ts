import { Test, TestingModule } from '@nestjs/testing';
import { CrmService } from './crm.service';
import { CrmDashboardService } from './crm-dashboard.service';
import { CrmAlertService } from './crm-alert.service';
import { CrmDeviceService } from './crm-device.service';

const mockDashboard = () => ({
  getDashboard: jest.fn(),
  getMlEventsBadge: jest.fn(),
  listMlEvents: jest.fn(),
  invalidateBadgeCache: jest.fn(),
  invalidateDashboardCache: jest.fn(),
  invalidateAllCache: jest.fn(),
});

const mockAlerts = () => ({
  listAlerts: jest.fn(),
  acknowledgeAlert: jest.fn(),
  resolveAlert: jest.fn(),
  getAlertSnapshot: jest.fn(),
});

const mockDevices = () => ({
  listDevices: jest.fn(),
  getDeviceProfile: jest.fn(),
  getDeviceTimeline: jest.fn(),
  getDeviceHistory: jest.fn(),
  getSensorSeries: jest.fn(),
});

describe('CrmService (Facade)', () => {
  let service: CrmService;
  let dashboard: ReturnType<typeof mockDashboard>;
  let alerts: ReturnType<typeof mockAlerts>;
  let devices: ReturnType<typeof mockDevices>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmService,
        { provide: CrmDashboardService, useFactory: mockDashboard },
        { provide: CrmAlertService, useFactory: mockAlerts },
        { provide: CrmDeviceService, useFactory: mockDevices },
      ],
    }).compile();

    service = module.get<CrmService>(CrmService);
    dashboard = module.get(CrmDashboardService);
    alerts = module.get(CrmAlertService);
    devices = module.get(CrmDeviceService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('delega listDevices a CrmDeviceService', async () => {
    const expected = { items: [], total: 0 };
    devices.listDevices.mockResolvedValue(expected);
    const result = await service.listDevices({ page: 1, pageSize: 20 }, { userId: '1' });
    expect(devices.listDevices).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, { userId: '1' });
    expect(result).toEqual(expected);
  });

  it('delega getDeviceProfile a CrmDeviceService', async () => {
    const expected = { summary: {}, sensors: [] };
    devices.getDeviceProfile.mockResolvedValue(expected);
    const result = await service.getDeviceProfile(1, { userId: '1' });
    expect(devices.getDeviceProfile).toHaveBeenCalledWith(1, { userId: '1' });
    expect(result).toEqual(expected);
  });

  it('delega listAlerts a CrmAlertService', async () => {
    const expected = { items: [], total: 0 };
    alerts.listAlerts.mockResolvedValue(expected);
    const result = await service.listAlerts({ page: 1, pageSize: 50 }, { userId: '1' });
    expect(alerts.listAlerts).toHaveBeenCalledWith({ page: 1, pageSize: 50 }, { userId: '1' });
    expect(result).toEqual(expected);
  });

  it('delega acknowledgeAlert a CrmAlertService', async () => {
    alerts.acknowledgeAlert.mockResolvedValue({ success: true });
    const result = await service.acknowledgeAlert(1, { userId: '1' });
    expect(alerts.acknowledgeAlert).toHaveBeenCalledWith(1, { userId: '1' });
    expect(result.success).toBe(true);
  });

  it('delega resolveAlert a CrmAlertService', async () => {
    alerts.resolveAlert.mockResolvedValue({ success: true });
    const result = await service.resolveAlert(1, { userId: '1' });
    expect(alerts.resolveAlert).toHaveBeenCalledWith(1, { userId: '1' });
    expect(result.success).toBe(true);
  });

  it('delega getDashboard a CrmDashboardService', async () => {
    const expected = { kpis: {} };
    dashboard.getDashboard.mockResolvedValue(expected);
    const result = await service.getDashboard({ alertsLimit: 10, eventsLimit: 10, topDevicesLimit: 5 }, { userId: '1' });
    expect(dashboard.getDashboard).toHaveBeenCalledWith({ alertsLimit: 10, eventsLimit: 10, topDevicesLimit: 5 }, { userId: '1' });
    expect(result).toEqual(expected);
  });

  it('delega getMlEventsBadge a CrmDashboardService', async () => {
    dashboard.getMlEventsBadge.mockResolvedValue({ count: 5 });
    const result = await service.getMlEventsBadge({ userId: '1' });
    expect(dashboard.getMlEventsBadge).toHaveBeenCalledWith({ userId: '1' });
    expect(result.count).toBe(5);
  });

  it('delega listMlEvents a CrmDashboardService', async () => {
    const expected = { items: [], total: 0 };
    dashboard.listMlEvents.mockResolvedValue(expected);
    const result = await service.listMlEvents({ page: 1, pageSize: 50 }, { userId: '1' });
    expect(dashboard.listMlEvents).toHaveBeenCalledWith({ page: 1, pageSize: 50 }, { userId: '1' });
    expect(result).toEqual(expected);
  });

  it('llama invalidateBadgeCache en dashboard', () => {
    dashboard.invalidateBadgeCache.mockImplementation(() => {});
    service.invalidateBadgeCache();
    expect(dashboard.invalidateBadgeCache).toHaveBeenCalled();
  });

  it('llama invalidateDashboardCache en dashboard', () => {
    dashboard.invalidateDashboardCache.mockImplementation(() => {});
    service.invalidateDashboardCache();
    expect(dashboard.invalidateDashboardCache).toHaveBeenCalled();
  });

  it('llama invalidateAllCache en dashboard', () => {
    dashboard.invalidateAllCache.mockImplementation(() => {});
    service.invalidateAllCache();
    expect(dashboard.invalidateAllCache).toHaveBeenCalled();
  });
});
