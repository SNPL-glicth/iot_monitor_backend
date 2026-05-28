import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

import { ACCESS_TOKEN_COOKIE } from '../auth/auth.cookies';
import { getJwtSecret } from '../auth/jwt-secret';

type SocketUser = { userId: string; username: string; role: string };

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  const parts = cookieHeader.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  @WebSocketServer()
  server!: Server;

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        // Auth por cookie para clientes web (Flutter/mobile usa handshake por mensaje)
        const cookies = parseCookies(socket.request.headers.cookie);
        const cookieToken = cookies[ACCESS_TOKEN_COOKIE];

        if (cookieToken) {
          const payload = await this.jwtService.verifyAsync(cookieToken, {
            secret: getJwtSecret(),
          });

          const user: SocketUser = {
            userId: String(payload.sub ?? ''),
            username: String(payload.username ?? ''),
            role: String(payload.role ?? ''),
          };

          socket.data.user = user;
        }

        // Permitir conexión inicial sin auth; Flutter se autentica por mensaje post-handshake
        return next();
      } catch {
        return next(new Error('unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    this.logger.log(
      `client connected id=${client.id} user=${user?.username ?? 'unknown'} role=${user?.role ?? 'unknown'}`,
    );
  }

  /**
   * FIX SEGURIDAD: Handshake de autenticación post-conexión.
   *
   * El cliente envía { token } después del upgrade WebSocket.
   * Si el token es inválido o expiró, se cierra la conexión con código 4001.
   */
  @SubscribeMessage('auth')
  async handleAuth(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { token?: string },
  ) {
    const token = data?.token;

    if (!token) {
      this.logger.warn(`auth failed: missing token (client ${client.id})`);
      client.emit('message', {
        event: 'auth_error',
        data: { reason: 'missing_token' },
      });
      this._closeWithCode(client, 4001, 'Unauthorized: missing token');
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(),
      });

      const user: SocketUser = {
        userId: String(payload.sub ?? ''),
        username: String(payload.username ?? ''),
        role: String(payload.role ?? ''),
      };

      // Actualizar usuario en socket (soporta reautenticación con token refrescado)
      client.data.user = user;

      client.emit('message', {
        event: 'auth_ok',
        data: { userId: user.userId },
      });

      this.logger.log(
        `client authenticated id=${client.id} user=${user.username} role=${user.role}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'invalid_token';
      this.logger.warn(`auth failed for client ${client.id}: ${reason}`);
      client.emit('message', {
        event: 'auth_error',
        data: { reason: 'invalid_token' },
      });
      this._closeWithCode(client, 4001, 'Unauthorized: invalid token');
    }
  }

  /**
   * Cierra la conexión Socket.IO con un código de cierre WebSocket personalizado.
   */
  private _closeWithCode(client: Socket, code: number, reason: string): void {
    // Forzar cierre inmediato del transporte subyacente con código específico
    const transport = (client as any).conn?.transport;
    if (transport?.socket) {
      transport.socket.close(code, reason);
    } else {
      client.disconnect(true);
    }
  }

  broadcast(
    event:
      | 'readings/latest'
      | 'alerts/active'
      | 'predictions/latest'
      | 'ml/events/active'
      | 'sensors/consolidated',
    payload: unknown,
  ) {
    // CRITICAL FIX: Flutter expects {event, data} structure
    this.server.emit('message', {
      event: event,
      data: payload,
    });
  }

  // (Opcional) ping manual
  ping(@ConnectedSocket() socket: Socket, @MessageBody() _body: unknown) {
    socket.emit('pong', { ok: true });
  }
}
