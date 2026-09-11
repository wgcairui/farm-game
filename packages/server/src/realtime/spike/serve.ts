/**
 * T0 spike — standalone Colyseus 0.18 server with a single `farm` room.
 *
 * This file is a temporary verification harness for G2. It deliberately does
 * NOT plug into the existing Fastify app, the player repo, or any database.
 * Its job is to confirm that the bundled `@colyseus/core` 0.18.12 and the
 * matching `@colyseus/ws-transport` 0.18.2 can boot a listening WebSocket
 * endpoint with a `Room` subclass and accept a raw WebSocket upgrade.
 *
 * The cross-version official SDK path was attempted and recorded below; see
 * `docs/progress-phase2.md` (T0 section) for the rationale.
 */

import { Server, Room, type Client } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

export class SpikeRoom extends Room {
  override maxClients = 4;

  override onCreate(_options: Record<string, unknown>): void {
    // Application data travels as our own `WsEnvelope` (see
    // packages/shared/src/protocol/ws.ts) inside ROOM_DATA — Colyseus state is
    // intentionally empty for this spike.
    this.onMessage('hello', (client: Client, message: unknown) => {
      const msg = message as { r?: string; p?: { playerId?: string } };
      this.send(client, 'welcome', {
        serverNow: Date.now(),
        roomId: this.roomId,
        echoedPlayerId: msg.p?.playerId ?? null,
        echoOf: msg.r ?? null,
      });
    });
  }

  override onJoin(client: Client): void {
    this.send(client, 'joined', { sessionId: client.sessionId, roomId: this.roomId });
  }

  override onLeave(client: Client, code: number): void {
    this.broadcast('left', { sessionId: client.sessionId, code }, { except: client });
  }
}

export interface SpikeServerHandle {
  port: number;
  shutdown: () => Promise<void>;
}

export async function startSpikeServer(port: number): Promise<SpikeServerHandle> {
  const server = new Server({
    transport: new WebSocketTransport(),
  });
  server.define('farm', SpikeRoom);
  await server.listen(port, '127.0.0.1');
  return {
    port,
    shutdown: () => server.gracefullyShutdown(false),
  };
}
