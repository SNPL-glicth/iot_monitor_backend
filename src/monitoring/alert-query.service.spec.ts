import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AlertQueryService } from './services/alert-query.service';
import { Alert } from '../entities/alert.entity';
import { ActiveAlertView, MlEventActiveView } from '../entities/views';

const mockAlertRepo = () => ({
  find: jest.fn(),
});

const mockActiveAlertViewRepo = () => ({
  createQueryBuilder: jest.fn(() => ({
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  })),
});

const mockMlEventActiveViewRepo = () => ({
  createQueryBuilder: jest.fn(() => ({
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  })),
});

describe('AlertQueryService', () => {
  let service: AlertQueryService;
  let alertRepo: ReturnType<typeof mockAlertRepo>;
  let activeAlertViewRepo: ReturnType<typeof mockActiveAlertViewRepo>;
  let mlEventViewRepo: ReturnType<typeof mockMlEventActiveViewRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertQueryService,
        { provide: getRepositoryToken(Alert), useFactory: mockAlertRepo },
        {
          provide: getRepositoryToken(ActiveAlertView),
          useFactory: mockActiveAlertViewRepo,
        },
        {
          provide: getRepositoryToken(MlEventActiveView),
          useFactory: mockMlEventActiveViewRepo,
        },
      ],
    }).compile();

    service = module.get<AlertQueryService>(AlertQueryService);
    alertRepo = module.get(getRepositoryToken(Alert));
    activeAlertViewRepo = module.get(getRepositoryToken(ActiveAlertView));
    mlEventViewRepo = module.get(getRepositoryToken(MlEventActiveView));
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('getActiveAlerts respeta el límite', async () => {
    const builder = {
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    activeAlertViewRepo.createQueryBuilder.mockReturnValue(builder);
    await service.getActiveAlerts(25);
    expect(builder.limit).toHaveBeenCalledWith(25);
  });

  it('getActiveAlerts retorna array vacío si no hay alertas', async () => {
    activeAlertViewRepo.createQueryBuilder.mockReturnValue({
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    const result = await service.getActiveAlerts();
    expect(result).toEqual([]);
  });

  it('getSensorAlertsHistory retorna array vacío si no hay historial', async () => {
    alertRepo.find.mockResolvedValue([]);
    const result = await service.getSensorAlertsHistory(123);
    expect(result).toEqual([]);
    expect(alertRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sensor: { id: '123' } },
      }),
    );
  });

  it('getActiveMlEvents no mezcla alertas normales con ML events', async () => {
    const mlEvent = {
      eventId: 'ml-1',
      eventType: 'anomaly',
      eventCode: 'SPIKE',
      title: 'Anomaly',
    } as any;
    mlEventViewRepo.createQueryBuilder.mockReturnValue({
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mlEvent]),
    });

    const result = await service.getActiveMlEvents();
    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe('anomaly');
    expect(result[0].eventCode).toBe('SPIKE');
  });
});
