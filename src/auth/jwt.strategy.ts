import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { getJwtSecret } from './jwt-secret';

export interface JwtPayload {
  sub: string;
  username: string;
  // email se incluye para poder pintar el perfil (mobile) sin tener que hacer lookup extra.
  email?: string;
  role: 'admin' | 'operator' | 'viewer';
}

function cookieExtractor(req: any): string | null {
  // Requires cookie-parser middleware.
  const token = req?.cookies?.access_token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    // SECURITY FIX: Use centralized getJwtSecret() with validation
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      username: payload.username,
      email: payload.email ?? null,
      role: payload.role,
    };
  }
}
