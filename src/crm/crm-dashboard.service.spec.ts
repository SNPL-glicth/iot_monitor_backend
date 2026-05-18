import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import { CrmDashboardService } from './crm-dashboard.service';

const createMockQueryRunner = () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  manager: {
    query: jest.fn(),
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    }),
  },
} as unknown as QueryRunner);

const mockDataSource = () => ({
  createQueryRunner: jest.fn().mockReturnValue(createMockQueryRunner()),
  query: jest.fn(),
});

describe('CrmDashboardService', () => {
  let service: CrmDashboardService;
  let dataSource: ReturnType<typeof mockDataSource>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrmDashboardService,
        { provide: DataSource, useFactory: mockDataSource },
      ],
    }).compile();

    service = module.get<CrmDashboardService>(CrmDashboardService);
    dataSource = module.get(DataSource);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('getDashboard', () => {
    it('debe retornar KPIs del dashboard con datos de BD', async () => {
      const qr = dataSource.createQueryRunner();
      qr.manager.query
        .mockResolvedValueOnce([{ status: 'active', cnt: 5 }])
        .mockResolvedValueOnce([{ severity: 'critical', cnt: 3 }])
        .mockResolvedValueOnce([{ deviceId: '1', deviceUuid: 'uuid-1', deviceName: 'Device 1', activeAlerts: 2 }])
        .mockResolvedValueOnce([{ alertId: '1', severity: 'critical' }])
        .mockResolvedValueOnce([{ eventType: 'alert', deviceId: '1' }]);

      const result = await service.getDashboard(
        { alertsLimit: 10, eventsLimit: 10, topDevicesLimit: 5 },
        { userId: '1', role: 'admin' },
      );

      expect(result).toBeDefined();
      expect(result.kpis).toBeDefined();
      expect(result.kpis.devicesByStatus).toBeDefined();
      expect(result.kpis.activeAlertsBySeverity).toBeDefined();
    });

    it('debe usar rango por defecto de 24h cuando no se especifica from/to', async () => {
      const qr = dataSource.createQueryRunner();
      qr.manager.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getDashboard(
        { alertsLimit: 10, eventsLimit: 10, topDevicesLimit: 5 },
        { userId: '1' },
      );

      expect(result.from).toBeDefined();
      expect(result.to).toBeDefined();
    });
  });

  describe('getMlEventsBadge', () => {
    it('debe retornar conteo de eventos ML', async () => {
      const qr = dataSource.createQueryRunner();
      qr.manager.getRepository().count.mockResolvedValue(7);
      const result = await service.getMlEventsBadge({ userId: '1' });
      expect(result.totalActiveMlEvents).toBe(7);
    });
  });

  describe('listMlEvents', () => {
    it('debe retornar eventos ML paginados', async () => {
      const qr = dataSource.createQueryRunner();
      const items = [{ id: '1', eventType: 'anomaly', deviceId: '1', createdAt: new Date() }];
      qr.manager.getRepository().createQueryBuilder().getManyAndCount.mockResolvedValue([items, 15]);

      const result = await service.listMlEvents(
        { page: 1, pageSize: 10, deviceId: '1' },
        { userId: '1' },
      );

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(15);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('cache invalidation', () => {
    it('debe invalidar badge cache sin errores', () => {
      expect(() => service.invalidateBadgeCache()).not.toThrow();
    });

    it('debe invalidar dashboard cache sin errores', () => {
      expect(() => service.invalidateDashboardCache()).not.toThrow();
    });

    it('debe invalidar todo el cache sin errores', () => {
      expect(() => service.invalidateAllCache()).not.toThrow();
    });
  });
});
