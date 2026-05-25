import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { PasswordUtil } from '../users/password.util';
import { durationToMs, getRefreshTokenSecret, sha256Hex } from './auth.utils';
import { getJwtSecret } from './jwt-secret';

type TokenContext = {
  ip?: string | null;
  userAgent?: string | null;
};

type TokenPair = {
  accessToken: string;
  accessTokenMaxAgeMs: number;
  refreshToken: string;
  refreshTokenMaxAgeMs: number;
};

// Servicio central de autenticación: valida credenciales y emite tokens JWT
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    // Repositorio TypeORM para consultar la tabla users
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    // Servicio de Nest para firmar y verificar JWT
    private readonly jwtService: JwtService,
  ) {}

  // Busca un usuario por username o email y valida su contraseña
  async validateUser(usernameOrEmail: string, password: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });

    if (!user || !user.isActive) {
      this.logger.warn(
        `Login fallido for=${usernameOrEmail} reason=user_not_found_or_inactive`,
      );
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!password) {
      this.logger.warn(
        `Login fallido userId=${user.id} username=${user.username} reason=missing_password`,
      );
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isValid = await PasswordUtil.comparePassword(password, user.passwordHash);
    if (!isValid) {
      this.logger.warn(
        `Login fallido userId=${user.id} username=${user.username} reason=invalid_password`,
      );
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return user;
  }

  private accessTokenTtl(): { expiresIn: number; maxAgeMs: number } {
    const raw = process.env.ACCESS_TOKEN_TTL ?? '15m';
    const maxAgeMs = durationToMs(raw, 15 * 60 * 1000);
    // jsonwebtoken acepta expiresIn como segundos (number)
    const expiresIn = Math.max(1, Math.floor(maxAgeMs / 1000));
    return { expiresIn, maxAgeMs };
  }

  private refreshTokenTtl(): { expiresIn: number; maxAgeMs: number } {
    const raw = process.env.REFRESH_TOKEN_TTL ?? '30d';
    const maxAgeMs = durationToMs(raw, 30 * 24 * 60 * 60 * 1000);
    const expiresIn = Math.max(1, Math.floor(maxAgeMs / 1000));
    return { expiresIn, maxAgeMs };
  }

  private async issueTokenPair(user: User, ctx: TokenContext): Promise<TokenPair> {
    const { expiresIn: accessExpiresIn, maxAgeMs: accessMaxAgeMs } =
      this.accessTokenTtl();
    const { expiresIn: refreshExpiresIn, maxAgeMs: refreshMaxAgeMs } =
      this.refreshTokenTtl();

    const accessPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      typ: 'access',
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      expiresIn: accessExpiresIn,
    });

    // Refresh token: signed with a (possibly different) secret.
    const refreshPayload = {
      sub: user.id,
      typ: 'refresh',
    };

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: getRefreshTokenSecret(),
      expiresIn: refreshExpiresIn,
    });

    const tokenHash = sha256Hex(refreshToken);

    const now = new Date();
    const refreshRow = this.refreshRepo.create({
      userId: user.id,
      tokenHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + refreshMaxAgeMs),
      revokedAt: null,
      replacedById: null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    await this.refreshRepo.save(refreshRow);

    return {
      accessToken,
      accessTokenMaxAgeMs: accessMaxAgeMs,
      refreshToken,
      refreshTokenMaxAgeMs: refreshMaxAgeMs,
    };
  }

  async loginCookie(usernameOrEmail: string, password: string, ctx: TokenContext) {
    const user = await this.validateUser(usernameOrEmail, password);
    this.logger.log(
      `Login OK userId=${user.id} username=${user.username} role=${user.role}`,
    );

    const pair = await this.issueTokenPair(user, ctx);

    return {
      tokens: pair,
      role: user.role,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    };
  }

  // Legacy login for clients that still want Bearer tokens (deprecated, use loginBearerWithRefresh).
  async loginBearer(usernameOrEmail: string, password: string) {
    const user = await this.validateUser(usernameOrEmail, password);
    this.logger.log(
      `Login OK (bearer) userId=${user.id} username=${user.username} role=${user.role}`,
    );

    const { expiresIn: accessExpiresIn } = this.accessTokenTtl();

    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      typ: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessExpiresIn,
    });

    return {
      access_token: accessToken,
      role: user.role,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    };
  }

  /**
   * Login Bearer con refresh token - para Flutter/mobile/scripts.
   * Retorna AMBOS tokens en el body para que el cliente los persista.
   */
  async loginBearerWithRefresh(usernameOrEmail: string, password: string, ctx: TokenContext) {
    const user = await this.validateUser(usernameOrEmail, password);
    this.logger.log(
      `Login OK (bearer+refresh) userId=${user.id} username=${user.username} role=${user.role}`,
    );

    const pair = await this.issueTokenPair(user, ctx);

    return {
      access_token: pair.accessToken,
      refresh_token: pair.refreshToken,
      access_token_expires_in: Math.floor(pair.accessTokenMaxAgeMs / 1000),
      refresh_token_expires_in: Math.floor(pair.refreshTokenMaxAgeMs / 1000),
      role: user.role,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    };
  }

  /**
   * Refresh Bearer token - recibe refresh_token en body, retorna nuevo par.
   */
  async refreshBearer(refreshToken: string, ctx: TokenContext) {
    // 1) Verify JWT signature/type
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: getRefreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (!payload || payload.typ !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const tokenHash = sha256Hex(refreshToken);

    // 2) Check DB row
    const row = await this.refreshRepo.findOne({ where: { tokenHash } });
    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Refresh token revocado');
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // 3) Load user
    const user = await this.userRepo.findOne({ where: { id: String(payload.sub) } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inválido');
    }

    // 4) Rotate refresh token
    const pair = await this.issueTokenPair(user, ctx);

    row.revokedAt = new Date();
    await this.refreshRepo.save(row);

    this.logger.log(`Token refreshed (bearer) userId=${user.id}`);

    return {
      access_token: pair.accessToken,
      refresh_token: pair.refreshToken,
      access_token_expires_in: Math.floor(pair.accessTokenMaxAgeMs / 1000),
      refresh_token_expires_in: Math.floor(pair.refreshTokenMaxAgeMs / 1000),
      role: user.role,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    };
  }

  async refreshCookie(refreshToken: string, ctx: TokenContext) {
    // 1) Verify JWT signature/type
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: getRefreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (!payload || payload.typ !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const tokenHash = sha256Hex(refreshToken);

    // 2) Check DB row
    const row = await this.refreshRepo.findOne({ where: { tokenHash } });
    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Refresh token revocado');
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // 3) Load user
    const user = await this.userRepo.findOne({ where: { id: String(payload.sub) } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inválido');
    }

    // 4) Rotate refresh token
    const pair = await this.issueTokenPair(user, ctx);

    row.revokedAt = new Date();
    // We don't know the new token row id here without extra query; keep it null for MVP.
    await this.refreshRepo.save(row);

    return {
      tokens: pair,
      role: user.role,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    };
  }

  async logoutCookie(refreshToken: string | null) {
    if (!refreshToken) return;

    const tokenHash = sha256Hex(refreshToken);
    const row = await this.refreshRepo.findOne({ where: { tokenHash } });
    if (!row || row.revokedAt) return;

    row.revokedAt = new Date();
    await this.refreshRepo.save(row);
  }

  /**
   * DEBUG: Verify a token and return diagnostic info.
   * Shows what secret is being used and token payload.
   */
  async debugVerifyToken(token: string) {
    const secret = getJwtSecret();
    const secretPreview = secret.substring(0, 8) + '...' + secret.substring(secret.length - 4);
    
    // Decode without verification first to see payload
    const parts = token.split('.');
    let decodedPayload: any = null;
    if (parts.length === 3) {
      try {
        decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      } catch {
        decodedPayload = 'Could not decode payload';
      }
    }

    // Now try to verify
    let verified = false;
    let verifyError: string | null = null;
    try {
      await this.jwtService.verifyAsync(token, { secret });
      verified = true;
    } catch (e) {
      verifyError = e instanceof Error ? e.message : 'Unknown error';
    }

    return {
      verified,
      secretUsed: secretPreview,
      secretLength: secret.length,
      secretSource: process.env.JWT_SECRET ? 'JWT_SECRET env var' : 'fallback (dev)',
      decodedPayload,
      verifyError,
      timestamp: new Date().toISOString(),
    };
  }
}
