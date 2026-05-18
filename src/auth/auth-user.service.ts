import { Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthUserService {
  constructor(private readonly auth: AuthService) {}

  async validateUser(usernameOrEmail: string, password: string) { return this.auth.validateUser(usernameOrEmail, password); }
  async loginCookie(usernameOrEmail: string, password: string, ctx: any) { return this.auth.loginCookie(usernameOrEmail, password, ctx); }
  async loginBearer(usernameOrEmail: string, password: string) { return this.auth.loginBearer(usernameOrEmail, password); }
  async loginBearerWithRefresh(usernameOrEmail: string, password: string, ctx: any) { return this.auth.loginBearerWithRefresh(usernameOrEmail, password, ctx); }
}
