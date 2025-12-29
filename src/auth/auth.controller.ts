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

class LoginDto {
  username!: string; // puede ser username o email
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Login seguro (producción): emite cookies HttpOnly y NO devuelve el access_token al frontend.
   */
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

    setAccessTokenCookie(res, result.tokens.accessToken, result.tokens.accessTokenMaxAgeMs);
    setRefreshTokenCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenMaxAgeMs);

    // CSRF token for double-submit cookie pattern.
    setCsrfCookie(res, generateCsrfToken());

    return { role: result.role, user: result.user };
  }

  /**
   * Login legacy: devuelve access_token para clientes que usan Authorization: Bearer.
   * Recomendado solo para apps nativas (Flutter) o scripts.
   */
  @Post('login-token')
  loginToken(@Body() body: LoginDto) {
    const { username, password } = body;
    return this.authService.loginBearer(username, password);
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
