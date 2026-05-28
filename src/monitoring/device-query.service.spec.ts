import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeviceQueryService } from './services/device-query.service';
import { Device } from '../entities/device.entity';
import { DeviceWithSensorsView } from '../entities/views';

const mockDeviceRepo = () => ({
  findOne: jest.fn(),
});

const mockDeviceWithSensorsViewRepo = () => ({
  find: jest.fn(),
});

describe('DeviceQueryService', () => {
  let service: DeviceQueryService;
  let deviceRepo: ReturnType<typeof mockDeviceRepo>;
  let viewRepo: ReturnType<typeof mockDeviceWithSensorsViewRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceQueryService,
        { provide: getRepositoryToken(Device), useFactory: mockDeviceRepo },
        {
          provide: getRepositoryToken(DeviceWithSensorsView),
          useFactory: mockDeviceWithSensorsViewRepo,
        },
      ],
    }).compile();

    service = module.get<DeviceQueryService>(DeviceQueryService);
    deviceRepo = module.get(getRepositoryToken(Device));
    viewRepo = module.get(getRepositoryToken(DeviceWithSensorsView));
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('getDevicesWithSensors retorna array vacío si no hay dispositivos', async () => {
    viewRepo.find.mockResolvedValue([]);
    const result = await service.getDevicesWithSensors();
    expect(result).toEqual([]);
    expect(viewRepo.find).toHaveBeenCalled();
  });

  it('getDevicesWithSensors mapea lastConnection con formatDateTime', async () => {
    const now = new Date();
    viewRepo.find.mockResolvedValue([
      {
        deviceId: '1',
        name: 'Device 1',
        lastConnection: now,
      } as any,
    ]);
    const result = await service.getDevicesWithSensors();
    expect(result[0].lastConnection).toBe(now.toISOString());
  });

  it('getDeviceById retorna null si no existe el ID', async () => {
    deviceRepo.findOne.mockResolvedValue(null);
    const result = await service.getDeviceById(999);
    expect(result).toBeNull();
    expect(deviceRepo.findOne).toHaveBeenCalledWith({
      where: { id: '999' },
    });
  });

  it('getDeviceById retorna el dispositivo correcto si existe', async () => {
    const device = { id: '1', name: 'Test Device' } as Device;
    deviceRepo.findOne.mockResolvedValue(device);
    const result = await service.getDeviceById(1);
    expect(result).toEqual(device);
    expect(deviceRepo.findOne).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });
});
