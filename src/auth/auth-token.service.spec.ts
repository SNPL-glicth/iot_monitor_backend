import { Test, TestingModule } from '@nestjs/testing';
import { AuthTokenService } from './auth-token.service';
import { AuthService } from './auth.service';

const mockAuthService = () => ({
  refreshBearer: jest.fn(),
  refreshCookie: jest.fn(),
  logoutCookie: jest.fn(),
  debugVerifyToken: jest.fn(),
});

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let authService: ReturnType<typeof mockAuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        { provide: AuthService, useFactory: mockAuthService },
      ],
    }).compile();

    service = module.get<AuthTokenService>(AuthTokenService);
    authService = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('delega refreshBearer al AuthService', async () => {
    const expected = { accessToken: 'new-token', refreshToken: 'new-refresh' };
    authService.refreshBearer.mockResolvedValue(expected);
    const result = await service.refreshBearer('old-refresh', { ip: '127.0.0.1' });
    expect(authService.refreshBearer).toHaveBeenCalledWith('old-refresh', { ip: '127.0.0.1' });
    expect(result).toEqual(expected);
  });

  it('delega refreshCookie al AuthService', async () => {
    const expected = { accessToken: 'new-token' };
    authService.refreshCookie.mockResolvedValue(expected);
    const result = await service.refreshCookie('old-refresh', { ip: '127.0.0.1' });
    expect(authService.refreshCookie).toHaveBeenCalledWith('old-refresh', { ip: '127.0.0.1' });
    expect(result).toEqual(expected);
  });

  it('delega logoutCookie al AuthService', async () => {
    authService.logoutCookie.mockResolvedValue(undefined);
    await service.logoutCookie('refresh-token');
    expect(authService.logoutCookie).toHaveBeenCalledWith('refresh-token');
  });

  it('delega debugVerifyToken al AuthService', async () => {
    const expected = { valid: true, payload: { sub: '1' } };
    authService.debugVerifyToken.mockResolvedValue(expected);
    const result = await service.debugVerifyToken('token-123');
    expect(authService.debugVerifyToken).toHaveBeenCalledWith('token-123');
    expect(result).toEqual(expected);
  });
});
