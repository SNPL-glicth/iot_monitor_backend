import { Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthTokenService {
  constructor(private readonly auth: AuthService) {}

  async refreshBearer(refreshToken: string, ctx: any) { return this.auth.refreshBearer(refreshToken, ctx); }
  async refreshCookie(refreshToken: string, ctx: any) { return this.auth.refreshCookie(refreshToken, ctx); }
  async logoutCookie(refreshToken: string | null) { return this.auth.logoutCookie(refreshToken); }
  async debugVerifyToken(token: string) { return this.auth.debugVerifyToken(token); }
}
