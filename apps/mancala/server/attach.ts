import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { type ClientMsg, WS_PATH } from '../src/net/protocol.ts';
import type { Fame } from './fame.ts';
import { type Conn, Rooms } from './rooms.ts';

/** Serves the game protocol over WebSocket on `WS_PATH` of an existing HTTP server. */
export function attachGameServer(http: Server, fame: Fame | null = null): Rooms {
  const rooms = new Rooms(fame);
  const wss = new WebSocketServer({ noServer: true });

  // Other upgrade requests (e.g. Vite's HMR socket) are left for their own handlers.
  http.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== WS_PATH) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
    const conn: Conn = { send: (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)) };
    ws.alive = true;
    ws.on('pong', () => (ws.alive = true));
    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      rooms.handle(conn, msg);
    });
    ws.on('close', () => rooms.disconnect(conn));
  });

  // Heartbeat: proxies and tunnels drop idle sockets, and dead peers should be noticed.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
    rooms.sweep();
  }, 25_000);
  http.on('close', () => clearInterval(heartbeat));
  return rooms;
}
