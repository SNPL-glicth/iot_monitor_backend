import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PredictionQueryService } from './services/prediction-query.service';

const mockDataSource = () => ({
  query: jest.fn(),
});

describe('PredictionQueryService', () => {
  let service: PredictionQueryService;
  let dataSource: ReturnType<typeof mockDataSource>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionQueryService,
        { provide: DataSource, useFactory: mockDataSource },
      ],
    }).compile();

    service = module.get<PredictionQueryService>(PredictionQueryService);
    dataSource = module.get(DataSource);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('getLatestPredictions desduplica por sensor (ROW_NUMBER)', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 1,
        predicted_value: 25.5,
        confidence: 0.95,
        predicted_at: new Date('2026-03-12T00:00:00Z'),
        target_timestamp: new Date('2026-03-12T01:00:00Z'),
        sensor_id: '1',
        sensor_name: 'Temp',
        unit: '°C',
        device_name: 'Device 1',
        model_name: 'LSTM',
        model_version: '1.0',
      },
    ]);

    const result = await service.getLatestPredictions(50);
    expect(result).toHaveLength(1);
    expect(result[0].sensorId).toBe('1');
    expect(dataSource.query).toHaveBeenCalled();
  });

  it('getLatestPredictions respeta el límite', async () => {
    dataSource.query.mockImplementation((sql: string, params: any[]) => {
      // Verificar que el parámetro de límite se pasa correctamente
      expect(params[0]).toBe(10);
      return [];
    });

    await service.getLatestPredictions(10);
  });

  it('getMlHealth retorna estructura válida sin predicciones recientes', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ predicted_at: null }]) // lastPrediction
      .mockResolvedValueOnce([{ cnt: 0 }]) // sensorsWithPredictions
      .mockResolvedValueOnce([{ cnt: 5 }]); // totalSensors

    const result = await service.getMlHealth();
    expect(result.status).toBe('DEGRADED');
    expect(result.lastRunAt).toBe('');
    expect(result.sensorsAnalyzed).toBe(0);
    expect(result.sensorsOmitted).toBe(5);
    expect(result.reasonsOmitted).toEqual([]);
  });
});
