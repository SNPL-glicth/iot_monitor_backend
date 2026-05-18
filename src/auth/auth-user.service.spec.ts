import { Test, TestingModule } from '@nestjs/testing';
import { AuthUserService } from './auth-user.service';
import { AuthService } from './auth.service';

const mockAuthService = () => ({
  validateUser: jest.fn(),
  loginCookie: jest.fn(),
  loginBearer: jest.fn(),
  loginBearerWithRefresh: jest.fn(),
});

describe('AuthUserService', () => {
  let service: AuthUserService;
  let authService: ReturnType<typeof mockAuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthUserService,
        { provide: AuthService, useFactory: mockAuthService },
      ],
    }).compile();

    service = module.get<AuthUserService>(AuthUserService);
    authService = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('delega validateUser con username y password', async () => {
    const expected = { id: '1', username: 'admin', role: 'admin' };
    authService.validateUser.mockResolvedValue(expected);
    const result = await service.validateUser('admin', 'password123');
    expect(authService.validateUser).toHaveBeenCalledWith('admin', 'password123');
    expect(result).toEqual(expected);
  });

  it('delega loginCookie con contexto', async () => {
    const expected = { accessToken: 'token', user: { id: '1' } };
    authService.loginCookie.mockResolvedValue(expected);
    const result = await service.loginCookie('admin', 'password123', { ip: '127.0.0.1' });
    expect(authService.loginCookie).toHaveBeenCalledWith('admin', 'password123', { ip: '127.0.0.1' });
    expect(result).toEqual(expected);
  });

  it('delega loginBearer sin contexto', async () => {
    const expected = { accessToken: 'token' };
    authService.loginBearer.mockResolvedValue(expected);
    const result = await service.loginBearer('admin', 'password123');
    expect(authService.loginBearer).toHaveBeenCalledWith('admin', 'password123');
    expect(result).toEqual(expected);
  });

  it('delega loginBearerWithRefresh con contexto', async () => {
    const expected = { accessToken: 'token', refreshToken: 'refresh' };
    authService.loginBearerWithRefresh.mockResolvedValue(expected);
    const result = await service.loginBearerWithRefresh('admin', 'password123', { ip: '127.0.0.1' });
    expect(authService.loginBearerWithRefresh).toHaveBeenCalledWith('admin', 'password123', { ip: '127.0.0.1' });
    expect(result).toEqual(expected);
  });
});
