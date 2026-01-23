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
   * Login para clientes Bearer (Flutter/mobile/scripts).
   * Retorna access_token Y refresh_token en el body (no cookies).
   * 
   * SECURITY: Rate limiting aplicado - máx 5 intentos por IP en 15 min.
   */
  @UseGuards(LoginRateLimitGuard)
  @Post('login-token')
  async loginToken(@Body() body: LoginDto, @Req() req: Request) {
    const { username, password } = body;
    
    const ctx = {
      ip: req.ip,
      userAgent: req.headers['user-agent']?.toString() ?? null,
    };
    
    const result = await this.authService.loginBearerWithRefresh(username, password, ctx);
    
    // Login exitoso: limpiar contadores de rate limiting
    clearLoginAttempts(this.getClientIp(req), username);
    
    return result;
  }

  /**
   * Refresh token para clientes Bearer (Flutter/mobile/scripts).
   * Recibe refresh_token en el BODY (no en cookies).
   * Retorna nuevo par de tokens.
   */
  @Post('refresh-token')
  async refreshToken(@Body() body: { refresh_token: string }, @Req() req: Request) {
    const refreshToken = body.refresh_token;
    if (!refreshToken) {
      return { ok: false, error: 'refresh_token required' };
    }

    const ctx = {
      ip: req.ip,
      userAgent: req.headers['user-agent']?.toString() ?? null,
    };

    try {
      const result = await this.authService.refreshBearer(refreshToken, ctx);
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Refresh failed' };
    }
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

  /**
   * DEBUG: Verifica un token y muestra info de diagnóstico.
   * NO usar en producción - solo para desarrollo.
   */
  @Post('debug/verify-token')
  async debugVerifyToken(@Body() body: { token: string }, @Req() req: Request) {
    const { token } = body;
    if (!token) {
      return { ok: false, error: 'token required' };
    }

    try {
      const result = await this.authService.debugVerifyToken(token);
      return { ok: true, ...result };
    } catch (error) {
      return { 
        ok: false, 
        error: error instanceof Error ? error.message : 'Verification failed',
        hint: 'Check if JWT_SECRET is consistent between signing and verification'
      };
    }
  }
}
