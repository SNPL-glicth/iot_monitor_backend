import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { AuthUserService } from './auth-user.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { durationToMs } from './auth.utils';
import { getJwtSecret } from './jwt-secret';

// Módulo que agrupa todo lo relacionado con autenticación y JWT
@Module({
  imports: [
    // Repositorio de usuarios para validar credenciales
    TypeOrmModule.forFeature([User, RefreshToken]),
    // Configuración del módulo JWT (clave y expiración del token)
    JwtModule.register({
      // FIX 401: Usar getJwtSecret() para consistencia con JwtStrategy
      secret: getJwtSecret(),
      // jsonwebtoken v9 (y tipos recientes) definen expiresIn como number (segundos) o StringValue.
      // Para evitar incompatibilidades con `string` genérico desde process.env, usamos segundos.
      signOptions: {
        expiresIn: Math.floor(
          durationToMs(process.env.ACCESS_TOKEN_TTL ?? '15m', 15 * 60 * 1000) / 1000,
        ),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthTokenService, AuthUserService, JwtStrategy],
  exports: [AuthService, AuthTokenService, AuthUserService, JwtModule],
})
export class AuthModule {}
