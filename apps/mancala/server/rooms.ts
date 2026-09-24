import { randomUUID } from 'node:crypto';
import { applyMove, canUseCard, type Card, createGame, type GameState, legalMoves, type Player, useCard } from '../src/game/kalah.ts';
import type { ClientMsg, ServerMsg } from '../src/net/protocol.ts';
import type { Fame } from './fame.ts';

/** Anything that can receive server messages; a WebSocket in production, a fake in tests. */
export interface Conn {
  send(msg: ServerMsg): void;
}

interface Seat {
  name: string;
  token: string;
  conn: Conn | null;
}

interface Room {
  id: string;
  seats: [Seat, Seat | null];
  state: GameState | null;
  /** Who started the current game; alternates on rematch. */
  first: Player;
  rematch: Set<Player>;
  lastActive: number;
  magic: boolean;
}

const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

function roomId(): string {
  let id = '';
  for (let i = 0; i < 6; i++) id += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return id;
}

function cleanName(name: unknown): string {
  return typeof name === 'string' ? name.trim().slice(0, 14) : '';
}

/**
 * Authoritative game rooms for remote two-player games. The server owns the game state and validates
 * every move, so a client can only ever play its own seat's legal moves.
 */
export class Rooms {
  private rooms = new Map<string, Room>();
  private seatOf = new Map<Conn, { room: Room; player: Player }>();
  private fame: Fame | null;

  constructor(fame: Fame | null = null) {
    this.fame = fame;
  }

  handle(conn: Conn, msg: ClientMsg) {
    switch (msg?.t) {
      case 'create':
        return this.create(conn, cleanName(msg.name), msg.magic === true);
      case 'peek':
        return this.peek(conn, msg.room);
      case 'join':
        return this.join(conn, msg.room, cleanName(msg.name));
      case 'resume':
        return this.resume(conn, msg.room, msg.token);
      case 'move':
        return this.move(conn, msg.pit);
      case 'card':
        return this.card(conn, msg.card, msg.target);
      case 'rematch':
        return this.rematch(conn);
      default:
        conn.send({ t: 'error', code: 'bad-request' });
    }
  }

  disconnect(conn: Conn) {
    const seat = this.seatOf.get(conn);
    if (!seat) return;
    this.seatOf.delete(conn);
    const s = seat.room.seats[seat.player];
    if (s?.conn === conn) s.conn = null;
    this.other(seat.room, seat.player)?.conn?.send({ t: 'peer', connected: false });
  }

  /** Drops rooms nobody has touched for a while. */
  sweep(now = Date.now()) {
    for (const [id, room] of this.rooms) {
      if (now - room.lastActive > ROOM_TTL_MS) this.rooms.delete(id);
    }
  }

  get size() {
    return this.rooms.size;
  }

  private create(conn: Conn, name: string, magic: boolean) {
    this.leaveCurrent(conn);
    let id = roomId();
    while (this.rooms.has(id)) id = roomId();
    const room: Room = {
      id,
      seats: [{ name, token: randomUUID(), conn }, null],
      state: null,
      first: 0,
      rematch: new Set(),
      lastActive: Date.now(),
      magic,
    };
    this.rooms.set(id, room);
    this.seatOf.set(conn, { room, player: 0 });
    conn.send({ t: 'created', room: id, token: room.seats[0].token });
  }

  private peek(conn: Conn, id: string) {
    const room = this.rooms.get(id);
    if (!room) return conn.send({ t: 'error', code: 'not-found' });
    conn.send({ t: 'room', room: id, hostName: room.seats[0].name, open: room.seats[1] === null, magic: room.magic });
  }

  private join(conn: Conn, id: string, name: string) {
    const room = this.rooms.get(id);
    if (!room) return conn.send({ t: 'error', code: 'not-found' });
    if (room.seats[1]) return conn.send({ t: 'error', code: 'full' });
    this.leaveCurrent(conn);
    room.seats[1] = { name, token: randomUUID(), conn };
    this.seatOf.set(conn, { room, player: 1 });
    room.state = createGame(4, room.first, room.magic);
    room.lastActive = Date.now();
    this.syncAll(room, 'start');
  }

  private resume(conn: Conn, id: string, token: string) {
    const room = this.rooms.get(id);
    const player = room?.seats.findIndex((s) => s?.token === token) as Player | -1 | undefined;
    if (!room || player === undefined || player === -1) return conn.send({ t: 'error', code: 'not-found' });
    this.leaveCurrent(conn);
    const seat = room.seats[player]!;
    // A newer tab wins over an older connection to the same seat.
    if (seat.conn && seat.conn !== conn) this.seatOf.delete(seat.conn);
    seat.conn = conn;
    this.seatOf.set(conn, { room, player });
    room.lastActive = Date.now();
    this.sync(room, player, 'resume');
    this.other(room, player)?.conn?.send({ t: 'peer', connected: true });
  }

  private move(conn: Conn, pit: number) {
    const seat = this.seatOf.get(conn);
    if (!seat) return conn.send({ t: 'error', code: 'not-in-room' });
    const { room, player } = seat;
    const state = room.state;
    if (!state || state.current !== player || !legalMoves(state).includes(pit)) {
      return conn.send({ t: 'error', code: 'bad-move' });
    }
    room.state = applyMove(state, pit).state;
    room.lastActive = Date.now();
    for (const s of room.seats) s?.conn?.send({ t: 'moved', pit, by: player, state: room.state });
    this.recordWinner(room);
  }

  private card(conn: Conn, card: Card, target: number | null) {
    const seat = this.seatOf.get(conn);
    if (!seat) return conn.send({ t: 'error', code: 'not-in-room' });
    const { room, player } = seat;
    const state = room.state;
    if (!state || state.current !== player || !canUseCard(state, card)) return conn.send({ t: 'error', code: 'bad-move' });
    try {
      room.state = useCard(state, card, target).state;
    } catch {
      return conn.send({ t: 'error', code: 'bad-move' });
    }
    room.lastActive = Date.now();
    for (const s of room.seats) s?.conn?.send({ t: 'card-used', by: player, card, target, state: room.state });
    this.recordWinner(room);
  }

  /** Online wins count on the wall of fame; the server saw the whole game, so they can be trusted. */
  private recordWinner(room: Room) {
    const w = room.state?.winner;
    if (room.state?.over && (w === 0 || w === 1)) this.fame?.record(room.seats[w]?.name ?? '', 'online');
  }

  private rematch(conn: Conn) {
    const seat = this.seatOf.get(conn);
    if (!seat) return conn.send({ t: 'error', code: 'not-in-room' });
    const { room, player } = seat;
    if (!room.state?.over) return;
    room.rematch.add(player);
    if (room.rematch.size < 2) {
      this.other(room, player)?.conn?.send({ t: 'rematch-requested', by: player });
      return;
    }
    room.rematch.clear();
    room.first = room.first === 0 ? 1 : 0;
    room.state = createGame(4, room.first, room.magic);
    room.lastActive = Date.now();
    this.syncAll(room, 'rematch');
  }

  private leaveCurrent(conn: Conn) {
    if (this.seatOf.has(conn)) this.disconnect(conn);
  }

  private other(room: Room, player: Player): Seat | null {
    return room.seats[player === 0 ? 1 : 0];
  }

  private syncAll(room: Room, reason: 'start' | 'rematch') {
    this.sync(room, 0, reason);
    if (room.seats[1]) this.sync(room, 1, reason);
  }

  private sync(room: Room, player: Player, reason: 'start' | 'rematch' | 'resume') {
    const seat = room.seats[player]!;
    seat.conn?.send({
      t: 'sync',
      room: room.id,
      token: seat.token,
      you: player,
      names: [room.seats[0].name, room.seats[1]?.name ?? null],
      state: room.state,
      reason,
    });
  }
}
