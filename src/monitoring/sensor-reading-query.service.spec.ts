import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SensorReadingQueryService } from './services/sensor-reading-query.service';
import { Sensor } from '../entities/sensor.entity';
import { SensorReading } from '../entities/sensor-reading.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';
import { LatestSensorReadingView } from '../entities/views';

const mockDataSource = () => ({
  query: jest.fn(),
});

const mockSensorRepo = () => ({
  findOne: jest.fn(),
});

const mockSensorReadingRepo = () => ({
  find: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  })),
});

const mockThresholdRepo = () => ({
  find: jest.fn(),
});

const mockLatestViewRepo = () => ({
  find: jest.fn(),
});

describe('SensorReadingQueryService', () => {
  let service: SensorReadingQueryService;
  let dataSource: ReturnType<typeof mockDataSource>;
  let sensorRepo: ReturnType<typeof mockSensorRepo>;
  let sensorReadingRepo: ReturnType<typeof mockSensorReadingRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SensorReadingQueryService,
        { provide: getRepositoryToken(Sensor), useFactory: mockSensorRepo },
        {
          provide: getRepositoryToken(SensorReading),
          useFactory: mockSensorReadingRepo,
        },
        {
          provide: getRepositoryToken(AlertThreshold),
          useFactory: mockThresholdRepo,
        },
        {
          provide: getRepositoryToken(LatestSensorReadingView),
          useFactory: mockLatestViewRepo,
        },
        { provide: DataSource, useFactory: mockDataSource },
      ],
    }).compile();

    service = module.get<SensorReadingQueryService>(SensorReadingQueryService);
    dataSource = module.get(DataSource);
    sensorRepo = module.get(getRepositoryToken(Sensor));
    sensorReadingRepo = module.get(getRepositoryToken(SensorReading));
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('getSensorReadings retorna array vacío si no hay lecturas', async () => {
    sensorReadingRepo.find.mockResolvedValue([]);
    const result = await service.getSensorReadings(123);
    expect(result).toEqual([]);
    expect(sensorReadingRepo.find).toHaveBeenCalled();
  });

  it('getSensorReadings respeta el límite de elementos', async () => {
    sensorReadingRepo.find.mockResolvedValue([]);
    await service.getSensorReadings(123, 25);
    expect(sensorReadingRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
  });

  it('insertSensorReading llama al stored procedure correcto', async () => {
    await service.insertSensorReading(123, 25.5);
    expect(dataSource.query).toHaveBeenCalledWith(
      'EXEC sp_insert_reading_and_check_threshold @p_sensor_id = @0, @p_value = @1',
      [123, 25.5],
    );
  });

  it('getHistoricalReadings con fechas inválidas lanza BadRequestException', async () => {
    sensorRepo.findOne.mockResolvedValue({
      id: '1',
      name: 'Test',
      unit: '°C',
    } as Sensor);

    await expect(
      service.getHistoricalReadings(1, 'invalid', 'invalid'),
    ).rejects.toThrow('Fechas inválidas');
  });

  it('getAggregatedSensorReadings agrupa correctamente (fallback a raw)', async () => {
    sensorRepo.findOne.mockResolvedValue({
      id: '1',
      name: 'Test',
      unit: '°C',
      device: { name: 'Device 1' },
    } as Sensor);

    dataSource.query.mockRejectedValueOnce(new Error('Table not found'));
    dataSource.query.mockResolvedValueOnce([
      {
        sensor_id: '1',
        bucket_ts: new Date('2026-03-12T00:00:00Z'),
        avg_value: 25.5,
        min_value: 20,
        max_value: 30,
        samples: 10,
      },
    ]);

    const result = await service.getAggregatedSensorReadings(1, '6h');
    expect(result.count).toBe(1);
    expect(result.series[0].avg).toBe(25.5);
  });
});
