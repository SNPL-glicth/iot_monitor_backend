import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SensorMetricsService } from './sensor-metrics.service';
import { Sensor } from '../entities/sensor.entity';
import { SensorReading } from '../entities/sensor-reading.entity';
import { AlertThreshold } from '../entities/alert-threshold.entity';

const mockSensorRepo = () => ({
  findOne: jest.fn(),
});

const mockSensorReadingRepo = () => ({
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  }),
});

const mockThresholdRepo = () => ({
  find: jest.fn(),
});

const mockDataSource = () => ({
  query: jest.fn(),
});

describe('SensorMetricsService', () => {
  let service: SensorMetricsService;
  let sensorRepo: ReturnType<typeof mockSensorRepo>;
  let sensorReadingRepo: ReturnType<typeof mockSensorReadingRepo>;
  let dataSource: ReturnType<typeof mockDataSource>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SensorMetricsService,
        { provide: getRepositoryToken(Sensor), useFactory: mockSensorRepo },
        { provide: getRepositoryToken(SensorReading), useFactory: mockSensorReadingRepo },
        { provide: getRepositoryToken(AlertThreshold), useFactory: mockThresholdRepo },
        { provide: DataSource, useFactory: mockDataSource },
      ],
    }).compile();

    service = module.get<SensorMetricsService>(SensorMetricsService);
    sensorRepo = module.get(getRepositoryToken(Sensor));
    sensorReadingRepo = module.get(getRepositoryToken(SensorReading));
    dataSource = module.get(DataSource);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('getSensorMetrics', () => {
    it('debe lanzar NotFoundException si el sensor no existe', async () => {
      sensorRepo.findOne.mockResolvedValue(null);
      await expect(service.getSensorMetrics(999, '1h')).rejects.toThrow('Sensor no encontrado');
    });

    it('debe retornar metricas con lecturas cuando hay datos', async () => {
      const sensor = { id: '123', name: 'Sensor 1' };
      sensorRepo.findOne.mockResolvedValue(sensor);

      dataSource.query.mockResolvedValue([
        { cnt: 5, min_val: 10, max_val: 50, avg_val: 30 },
      ]);

      const readings = [
        { id: '1', value: 25, timestamp: new Date() },
        { id: '2', value: 30, timestamp: new Date() },
      ];

      sensorReadingRepo.createQueryBuilder().getMany.mockResolvedValue(readings);

      const result = await service.getSensorMetrics(123, '1h');

      expect(result.sensorId).toBe(123);
      expect(result.window).toBe('1h');
      expect(result.count).toBe(5);
      expect(result.min).toBe(10);
      expect(result.max).toBe(50);
      expect(result.avg).toBe(30);
      expect(result.readings).toHaveLength(2);
    });

    it('debe retornar valores nulos cuando no hay lecturas', async () => {
      const sensor = { id: '123', name: 'Sensor 1' };
      sensorRepo.findOne.mockResolvedValue(sensor);

      dataSource.query.mockResolvedValue([{ cnt: 0, min_val: null, max_val: null, avg_val: null }]);

      const result = await service.getSensorMetrics(123, '1h');

      expect(result.count).toBe(0);
      expect(result.min).toBeNull();
      expect(result.max).toBeNull();
      expect(result.avg).toBeNull();
      expect(result.readings).toEqual([]);
    });
  });

  describe('getRawSensorReadings', () => {
    it('debe lanzar NotFoundException si el sensor no existe', async () => {
      sensorRepo.findOne.mockResolvedValue(null);
      await expect(service.getRawSensorReadings(999)).rejects.toThrow('Sensor no encontrado');
    });

    it('debe retornar lecturas ordenadas', async () => {
      const sensor = { id: '123', name: 'Sensor 1', device: { id: '1', name: 'Device 1' }, unit: 'C' };
      sensorRepo.findOne.mockResolvedValue(sensor);

      const readings = [
        { id: '1', value: 25, timestamp: new Date('2026-01-01T10:00:00Z') },
        { id: '2', value: 30, timestamp: new Date('2026-01-01T11:00:00Z') },
      ];

      sensorReadingRepo.createQueryBuilder().getMany.mockResolvedValue(readings);

      const result = await service.getRawSensorReadings(123, 100);

      expect(result.sensorId).toBe('123');
      expect(result.sensorName).toBe('Sensor 1');
      expect(result.count).toBe(2);
      expect(result.readings).toHaveLength(2);
      expect(result.readings[0].value).toBe(25);
    });
  });
});
