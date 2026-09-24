import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '../src/net/protocol';
import { Fame } from './fame';
import { Rooms } from './rooms';

class FakeConn {
  inbox: ServerMsg[] = [];
  send(msg: ServerMsg) {
    this.inbox.push(msg);
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> {
    const m = [...this.inbox].reverse().find((x) => x.t === t);
    if (!m) throw new Error(`no ${t} message`);
    return m as Extract<ServerMsg, { t: T }>;
  }
}

function startGame(magic = false) {
  const fame = new Fame();
  const rooms = new Rooms(fame);
  const host = new FakeConn();
  const guest = new FakeConn();
  rooms.handle(host, { t: 'create', name: 'עידו', magic });
  const room = host.last('created').room;
  rooms.handle(guest, { t: 'peek', room });
  rooms.handle(guest, { t: 'join', room, name: 'דנה' });
  return { rooms, host, guest, room, fame };
}

describe('rooms', () => {
  it('lets a guest see who invited them, then starts the game for both', () => {
    const { host, guest } = startGame();
    expect(guest.last('room')).toMatchObject({ hostName: 'עידו', open: true });
    expect(host.last('sync')).toMatchObject({ you: 0, names: ['עידו', 'דנה'], reason: 'start' });
    expect(guest.last('sync')).toMatchObject({ you: 1, names: ['עידו', 'דנה'], reason: 'start' });
    expect(host.last('sync').state?.current).toBe(0);
  });

  it('rejects unknown and full rooms', () => {
    const { rooms, room } = startGame();
    const third = new FakeConn();
    rooms.handle(third, { t: 'join', room, name: 'x' });
    expect(third.last('error').code).toBe('full');
    rooms.handle(third, { t: 'join', room: 'nope', name: 'x' });
    expect(third.last('error').code).toBe('not-found');
  });

  it('only accepts legal moves from the player whose turn it is, and broadcasts them', () => {
    const { rooms, host, guest } = startGame();
    rooms.handle(guest, { t: 'move', pit: 7 });
    expect(guest.last('error').code).toBe('bad-move');
    rooms.handle(host, { t: 'move', pit: 8 }); // not host's pit
    expect(host.last('error').code).toBe('bad-move');
    rooms.handle(host, { t: 'move', pit: 0 });
    expect(host.last('moved')).toMatchObject({ pit: 0, by: 0 });
    expect(guest.last('moved').state.current).toBe(1);
  });

  it('lets a player reconnect to their seat with their token', () => {
    const { rooms, host, guest, room } = startGame();
    rooms.handle(host, { t: 'move', pit: 0 });
    const token = guest.last('sync').token;
    rooms.disconnect(guest);
    expect(host.last('peer').connected).toBe(false);

    const again = new FakeConn();
    rooms.handle(again, { t: 'resume', room, token });
    expect(again.last('sync')).toMatchObject({ you: 1, reason: 'resume' });
    expect(again.last('sync').state?.board[0]).toBe(0);
    expect(host.last('peer').connected).toBe(true);
    rooms.handle(again, { t: 'move', pit: 7 });
    expect(host.last('moved').by).toBe(1);

    const stranger = new FakeConn();
    rooms.handle(stranger, { t: 'resume', room, token: 'wrong' });
    expect(stranger.last('error').code).toBe('not-found');
  });

  it('starts a rematch once both agree, alternating who goes first', () => {
    const { rooms, host, guest } = startGame();
    // Play to the end with the first legal move each turn.
    for (let n = 0; n < 300; n++) {
      const s = host.inbox.filter((m) => m.t === 'moved').at(-1)?.state ?? host.last('sync').state!;
      if (s.over) break;
      const conn = s.current === 0 ? host : guest;
      const pits = s.current === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
      rooms.handle(conn, { t: 'move', pit: pits.find((p) => s.board[p] > 0)! });
    }
    rooms.handle(host, { t: 'rematch' });
    expect(guest.last('rematch-requested').by).toBe(0);
    rooms.handle(guest, { t: 'rematch' });
    expect(host.last('sync')).toMatchObject({ reason: 'rematch' });
    expect(host.last('sync').state?.current).toBe(1);
  });

  it('expires idle rooms', () => {
    const { rooms } = startGame();
    rooms.sweep(Date.now() + 7 * 60 * 60 * 1000);
    expect(rooms.size).toBe(0);
  });

  it('deals magic cards in magic rooms and lets only the player on turn play theirs', () => {
    const { rooms, host, guest } = startGame(true);
    const start = host.last('sync').state!;
    expect(start.magic?.cards).toHaveLength(2);
    expect(guest.last('room').magic).toBe(true);
    const guestCard = start.magic!.cards[1]!;
    rooms.handle(guest, { t: 'card', card: guestCard, target: 0 });
    expect(guest.last('error').code).toBe('bad-move'); // not their turn
    const hostCard = start.magic!.cards[0]!;
    rooms.handle(host, { t: 'card', card: hostCard, target: hostCard === 'block' ? 7 : null });
    const used = guest.last('card-used');
    expect(used).toMatchObject({ by: 0, card: hostCard });
    expect(used.state.magic!.cards[0]).toBeNull();
    rooms.handle(host, { t: 'card', card: hostCard, target: 8 });
    expect(host.last('error').code).toBe('bad-move'); // only once per game
  });

  it('records online winners on the wall of fame', () => {
    const { rooms, host, guest, fame } = startGame();
    for (let n = 0; n < 300; n++) {
      const s = host.inbox.filter((m) => m.t === 'moved').at(-1)?.state ?? host.last('sync').state!;
      if (s.over) break;
      const conn = s.current === 0 ? host : guest;
      const pits = s.current === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
      rooms.handle(conn, { t: 'move', pit: pits.find((p) => s.board[p] > 0)! });
    }
    const final = host.last('moved').state;
    const top = fame.top();
    if (final.winner === 'draw') expect(top).toEqual([]);
    else expect(top[0]).toMatchObject({ name: final.winner === 0 ? 'עידו' : 'דנה', wins: 1, online: 1 });
  });
});
