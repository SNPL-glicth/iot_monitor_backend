import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
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
        const cookies = parseCookies(socket.request.headers.cookie);
        const token = cookies[ACCESS_TOKEN_COOKIE];
        if (!token) {
          return next(new Error('unauthorized'));
        }

        const payload = await this.jwtService.verifyAsync(token, {
          secret: getJwtSecret(),
        });

        const user: SocketUser = {
          userId: String(payload.sub ?? ''),
          username: String(payload.username ?? ''),
          role: String(payload.role ?? ''),
        };

        socket.data.user = user;
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

  broadcast(
    event:
      | 'readings/latest'
      | 'alerts/active'
      | 'predictions/latest'
      | 'ml/events/active',
    payload: unknown,
  ) {
    this.server.emit(event, payload);
  }

  // (Opcional) ping manual
  ping(@ConnectedSocket() socket: Socket, @MessageBody() _body: unknown) {
    socket.emit('pong', { ok: true });
  }
}
