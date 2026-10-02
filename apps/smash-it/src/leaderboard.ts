/**
 * Talking to the leaderboards (server/scores.ts). Joining is optional: until the player picks a nickname,
 * nothing is sent. The player is known to the server by a random id kept here, never by anything personal.
 */
import { pick, makeRng } from './game/rng';

const KEY = 'smashIt.player';
const API = 'api/scores';

export interface Player {
  id: string;
  name: string;
  /** Chose to appear on the boards. */
  joined: boolean;
}

export interface Boards {
  all: { name: string; stars: number; chapter: number; me?: boolean }[];
  daily: { name: string; score: number; me?: boolean }[];
  rank: { all: number | null; daily: number | null };
}

/** Fun nicknames, so kids don't need to type their real name. */
const NICKS = ['נמלה טסה', 'חיפושית אש', 'פרפר פרו', 'זבוב טורבו', 'שבלול איזי', 'פרת משה פצצה', 'עוגייה מעופפת', 'אבטיח בום', 'פופקורן מטורף', 'ג׳לי קופצני', 'פיצה אגדית', 'דונאט נינג׳ה'];

export function randomNick(): string {
  const rng = makeRng((Math.random() * 2 ** 32) >>> 0);
  return `${pick(rng, NICKS)} ${1 + Math.floor(rng() * 99)}`;
}

export function loadPlayer(): Player {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Player> | null;
    if (p && typeof p.id === 'string' && /^[a-z0-9-]{8,40}$/i.test(p.id)) return { id: p.id, name: String(p.name ?? ''), joined: !!p.joined };
  } catch {
    /* new player */
  }
  const id = crypto.randomUUID?.() ?? `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return { id, name: '', joined: false };
}

export function savePlayer(p: Player) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Sends the player's results (only if they joined). Fails quietly when offline. */
export async function report(p: Player, stars: number, chapter: number, daily?: { date: string; score: number }) {
  if (!p.joined || !p.name) return;
  try {
    await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p.id, name: p.name, stars, chapter, daily }) });
  } catch {
    /* offline: the next result will catch up (the server keeps the best) */
  }
}

export async function fetchBoards(p: Player, date: string): Promise<Boards | null> {
  try {
    const res = await fetch(`${API}?date=${date}&id=${encodeURIComponent(p.id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Boards;
  } catch {
    return null;
  }
}

/** Leaves the boards: the server forgets the player. */
export async function leave(p: Player): Promise<boolean> {
  try {
    const res = await fetch(`${API}?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
