import { type ClientMsg, type ServerMsg, WS_PATH } from './protocol';

const tokenKey = (room: string) => `mancala.seat.${room}`;

/** This tab's seat token for a room, if it has one (kept per tab so two tabs can play each other). */
export function savedToken(room: string): string | null {
  return sessionStorage.getItem(tokenKey(room));
}

/**
 * WebSocket connection to the game server. Reconnects automatically and, once it holds a seat,
 * re-claims it with its token so a dropped connection or a page reload resumes the same game.
 */
export class OnlineClient {
  private ws: WebSocket | null = null;
  private pending: ClientMsg[] = [];
  private closed = false;
  private retry = 0;
  private seat: { room: string; token: string } | null = null;

  constructor(
    private onMessage: (msg: ServerMsg) => void,
    private onConnection: (connected: boolean) => void,
  ) {
    this.connect();
  }

  /** Resume a seat on the next (re)connect. */
  resume(room: string, token: string) {
    this.seat = { room, token };
    this.send({ t: 'resume', room, token });
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else this.pending.push(msg);
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }

  private connect() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onConnection(true);
      const queued = this.pending.splice(0);
      // After a drop, re-claim the seat before anything else.
      if (this.seat && !queued.some((m) => m.t === 'resume')) queued.unshift({ t: 'resume', ...this.seat });
      for (const m of queued) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMsg;
      if (msg.t === 'created') this.remember(msg.room, msg.token);
      if (msg.t === 'sync') this.remember(msg.room, msg.token);
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.onConnection(false);
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  private remember(room: string, token: string) {
    this.seat = { room, token };
    sessionStorage.setItem(tokenKey(room), token);
  }
}
