/**
 * The blueprint lens: the same night drawn as an architecture diagram, from the same state the restaurant
 * is drawn from (it never owns state). Clients (the tables) → load balancer (the host) → API instances (the
 * waiters) → the database (the stock board) and the queue (the ticket rail) → workers (the cooks).
 */
import type { Night } from './game/night';
import { glyphPaths, type Glyph } from './glyphs';
import { t } from './i18n/strings';

const NS = 'http://www.w3.org/2000/svg';
const W = 1000;
const H = 600;

type El = SVGElement;

function el(tag: string, attrs: Record<string, string | number>, ...kids: (El | string)[]): El {
  const e = document.createElementNS(NS, tag) as El;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) e.append(k);
  return e;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function node(b: Box, icon: Glyph, title: string, sub: string, detail: string | string[], state: '' | 'busy' | 'hot' | 'off'): El {
  const g = el('g', { class: `bp-node ${state}`, transform: `translate(${b.x} ${b.y})` });
  g.append(
    el('rect', { width: b.w, height: b.h, rx: 14 }),
    el('g', { class: 'bp-icon', transform: 'translate(12 12) scale(1.25)' }),
    el('text', { x: 50, y: 30, class: 'bp-title' }, title),
    el('text', { x: b.w - 12, y: 52, class: 'bp-sub', 'text-anchor': 'start', direction: 'rtl' }, sub),
  );
  (g.children[1] as El).innerHTML = glyphPaths(icon);
  const lines = [detail].flat().filter(Boolean);
  lines.forEach((l, i) => g.append(el('text', { x: 14, y: b.h - 14 - (lines.length - 1 - i) * 22, class: 'bp-detail' }, l)));
  return g;
}

function edgeDown(a: Box, b: Box, state: '' | 'busy' | 'hot'): El {
  const x = a.x + a.w / 2;
  const g = el('g', { class: `bp-edge ${state}` });
  g.append(el('path', { d: `M${x} ${a.y + a.h} L${x} ${b.y - 6}`, 'marker-end': 'url(#bp-arrow)' }));
  return g;
}

function edge(a: Box, b: Box, state: '' | 'busy' | 'hot', label = '', bend = 0): El {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const mx = (x1 + x2) / 2;
  const g = el('g', { class: `bp-edge ${state}` });
  g.append(el('path', { d: `M${x1} ${y1} C${mx} ${y1 + bend} ${mx} ${y2 + bend} ${x2 - 6} ${y2}`, 'marker-end': 'url(#bp-arrow)' }));
  if (label) g.append(el('text', { x: mx, y: (y1 + y2) / 2 + bend - 8, 'text-anchor': 'middle', class: 'bp-label' }, label));
  return g;
}

/** Draws the night into `host` (an SVG-holding element), replacing what was there. */
export function drawBlueprint(host: HTMLElement, n: Night) {
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t.lensTitle }) as SVGSVGElement;
  svg.append(
    el(
      'defs',
      {},
      el('marker', { id: 'bp-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, el('path', { d: 'M0 0L10 5L0 10z', class: 'bp-arrowhead' })),
    ),
  );

  const recent = (kind: string, within = 3, pred: (e: (typeof n.log)[number]) => boolean = () => true) => n.log.some((e) => e.kind === kind && n.t - e.t < within && pred(e));
  const alert = recent('noStock', 8);

  // Clients: one small box per table, coloured by what that table is waiting for.
  const clients: Box = { x: 30, y: 120, w: 170, h: 360 };
  const cg = el('g', { class: 'bp-clients', transform: `translate(${clients.x} ${clients.y})` });
  cg.append(el('rect', { width: clients.w, height: clients.h, rx: 14 }), el('text', { x: 14, y: 30, class: 'bp-title' }, 'Clients'), el('text', { x: clients.w - 12, y: 52, class: 'bp-sub', 'text-anchor': 'start', direction: 'rtl' }, t.lens.clients));
  n.tables.forEach((gid, i) => {
    const g = gid === null ? null : n.groups[gid];
    const waiting = g && (g.state === 'seated' || g.state === 'bill') && n.t - g.since > 6;
    const cls = !g ? 'free' : waiting ? 'waiting' : g.state === 'eating' ? 'eating' : 'busy';
    const x = 16 + (i % 2) * 74;
    const y = 72 + Math.floor(i / 2) * 68;
    cg.append(el('rect', { x, y, width: 64, height: 54, rx: 9, class: `bp-table ${cls}` }), el('text', { x: x + 32, y: y + 34, 'text-anchor': 'middle', class: 'bp-table-n' }, String(i + 1)));
  });
  svg.append(cg);

  const door = n.groups.filter((g) => g.state === 'door').length;
  const lb: Box = { x: 250, y: 250, w: 170, h: 100 };
  svg.append(edge(clients, lb, door > 0 ? 'busy' : '', door ? `queue ${door}` : ''));
  svg.append(node(lb, 'lb', 'Load balancer', t.lens.lb, '', door > 3 ? 'hot' : ''));

  // API instances: the waiters, with what each is doing.
  const working = n.waiters.filter((w) => w.joined <= n.t);
  const apis: Box[] = working.map((_, i) => ({ x: 470, y: working.length === 1 ? 250 : 170 + i * 170, w: 200, h: 100 }));
  const db: Box = { x: 740, y: 20, w: 240, h: 170 };
  const queue: Box = { x: 760, y: 270, w: 210, h: 100 };
  const queries: string[] = [];
  working.forEach((w, i) => {
    const job = w.job;
    const name = t.waiters[w.id % t.waiters.length].name;
    const doing = !job ? 'idle' : job.kind === 'takeOrder' && job.read === null ? 'waiting for lock' : job.kind === 'takeOrder' ? 'POST /order' : job.kind === 'serve' ? 'GET /dish' : 'POST /bill';
    svg.append(edge(lb, apis[i], job ? 'busy' : ''));
    svg.append(node(apis[i], 'server', `API #${w.id + 1}`, name, doing, job ? 'busy' : ''));
    const read = recent('read', 3, (e) => e.waiter === w.id && e.dish === 'salmon');
    const wrote = recent('write', 3, (e) => e.waiter === w.id);
    const raceNow = read && working.some((o) => o.id !== w.id && recent('read', 3, (e) => e.waiter === o.id && e.dish === 'salmon'));
    const last = [...n.log].reverse().find((e) => (e.kind === 'read' || e.kind === 'write') && e.waiter === w.id && n.t - e.t < 3);
    if (last) queries.push(`#${w.id + 1} ${last.kind === 'read' ? 'SELECT' : 'UPDATE'} salmon ${last.kind === 'read' ? '→' : '='} ${last.value}`);
    svg.append(edge(apis[i], db, raceNow ? 'hot' : read || wrote ? 'busy' : '', '', -20));
    svg.append(edge(apis[i], queue, recent('order', 2, (e) => e.waiter === w.id) ? 'busy' : '', '', 10));
  });

  const lockHeld = n.marker !== null ? `🔒 API #${n.marker + 1}` : n.has('lock') ? '🔒 free' : '';
  svg.append(node(db, 'db', 'Database', t.lens.db, [...queries, `salmon = ${n.board}  (fridge ${n.fridge})${lockHeld ? '  ' + lockHeld : ''}`], alert ? 'hot' : ''));

  const waitingTickets = n.tickets.filter((k) => k.cooking === null).length;
  svg.append(node(queue, 'queue', 'Queue', t.lens.queue, `${waitingTickets} waiting`, waitingTickets > 3 ? 'hot' : waitingTickets ? 'busy' : ''));

  const cooks = [0, 1].map((c) => n.tickets.some((k) => k.cook === c && k.cooking !== null && k.ready === null));
  const wbox: Box = { x: 760, y: 440, w: 210, h: 110 };
  svg.append(edgeDown(queue, wbox, cooks.some(Boolean) ? 'busy' : ''));
  svg.append(node(wbox, 'worker', 'Workers ×2', t.lens.workers, cooks.map((b) => (b ? '■' : '□')).join(' '), alert ? 'hot' : cooks.some(Boolean) ? 'busy' : ''));

  host.replaceChildren(svg);
}
