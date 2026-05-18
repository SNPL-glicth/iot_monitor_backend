import { Test, TestingModule } from '@nestjs/testing';
import { IntelligencePredictionService } from './intelligence-prediction.service';
import { IntelligenceService } from './intelligence.service';

const mockIntelligence = () => ({
  listPredictions: jest.fn(),
  listWarnings: jest.fn(),
});

describe('IntelligencePredictionService', () => {
  let service: IntelligencePredictionService;
  let intelligence: ReturnType<typeof mockIntelligence>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntelligencePredictionService,
        { provide: IntelligenceService, useFactory: mockIntelligence },
      ],
    }).compile();

    service = module.get<IntelligencePredictionService>(IntelligencePredictionService);
    intelligence = module.get(IntelligenceService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('delega listPredictions al IntelligenceService', async () => {
    const expected = [{ sensorId: '1', predictedValue: 25.5 }];
    intelligence.listPredictions.mockResolvedValue(expected);
    const result = await service.listPredictions(50);
    expect(intelligence.listPredictions).toHaveBeenCalledWith(50);
    expect(result).toEqual(expected);
  });

  it('delega listWarnings al IntelligenceService con status', async () => {
    const expected = [{ sensorId: '1', severity: 'warning' }];
    intelligence.listWarnings.mockResolvedValue(expected);
    const result = await service.listWarnings(50, 'active');
    expect(intelligence.listWarnings).toHaveBeenCalledWith(50, 'active');
    expect(result).toEqual(expected);
  });
});
