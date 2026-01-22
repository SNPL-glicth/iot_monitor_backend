import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';

import {
  clearAccessTokenCookie,
  clearCsrfCookie,
  clearRefreshTokenCookie,
  setAccessTokenCookie,
  setCsrfCookie,
  setRefreshTokenCookie,
} from './auth.cookies';
import { AuthService } from './auth.service';
import { generateCsrfToken } from './auth.utils';
import { LoginRateLimitGuard, clearLoginAttempts } from './login-rate-limit.guard';

class LoginDto {
  username!: string; // puede ser username o email
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Login seguro (producción): emite cookies HttpOnly y NO devuelve el access_token al frontend.
   * 
   * SECURITY: Rate limiting aplicado - máx 5 intentos por IP en 15 min.
   */
  @UseGuards(LoginRateLimitGuard)
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { username, password } = body;

    const ctx = {
      ip: req.ip,
      userAgent: req.headers['user-agent']?.toString() ?? null,
    };

    const result = await this.authService.loginCookie(username, password, ctx);

    // Login exitoso: limpiar contadores de rate limiting
    clearLoginAttempts(this.getClientIp(req), username);

    setAccessTokenCookie(res, result.tokens.accessToken, result.tokens.accessTokenMaxAgeMs);
    setRefreshTokenCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenMaxAgeMs);

    // CSRF token for double-submit cookie pattern.
    setCsrfCookie(res, generateCsrfToken());

    return { role: result.role, user: result.user };
  }

  /**
   * Login legacy: devuelve access_token para clientes que usan Authorization: Bearer.
   * Recomendado solo para apps nativas (Flutter) o scripts.
   * 
   * SECURITY: Rate limiting aplicado - máx 5 intentos por IP en 15 min.
   */
  @UseGuards(LoginRateLimitGuard)
  @Post('login-token')
  async loginToken(@Body() body: LoginDto, @Req() req: Request) {
    const { username, password } = body;
    const result = await this.authService.loginBearer(username, password);
    
    // Login exitoso: limpiar contadores de rate limiting
    clearLoginAttempts(this.getClientIp(req), username);
    
    return result;
  }
  
  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  /**
   * Refresca sesión (rotación de refresh token).
   * Requiere CSRF si se usa cookie session.
   */
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req as any).cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      // clear just in case
      clearAccessTokenCookie(res);
      clearRefreshTokenCookie(res);
      clearCsrfCookie(res);
      return { ok: false };
    }

    const ctx = {
      ip: req.ip,
      userAgent: req.headers['user-agent']?.toString() ?? null,
    };

    const result = await this.authService.refreshCookie(refreshToken, ctx);

    setAccessTokenCookie(res, result.tokens.accessToken, result.tokens.accessTokenMaxAgeMs);
    setRefreshTokenCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenMaxAgeMs);
    setCsrfCookie(res, generateCsrfToken());

    return { ok: true, role: result.role, user: result.user };
  }

  /**
   * Logout: revoca refresh token (si existe) y limpia cookies.
   * Requiere CSRF si se usa cookie session.
   */
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = ((req as any).cookies?.refresh_token as string | undefined) ?? null;
    await this.authService.logoutCookie(refreshToken);

    clearAccessTokenCookie(res);
    clearRefreshTokenCookie(res);
    clearCsrfCookie(res);

    return { ok: true };
  }

  /**
   * Devuelve info de sesión actual (para bootstrapping de frontend con cookies).
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Req() req: any) {
    return { user: req.user };
  }
}
