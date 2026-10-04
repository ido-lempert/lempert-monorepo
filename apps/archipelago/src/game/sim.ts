/**
 * Runs a build: sends every flow's request along the edges and reports where it got and why it failed.
 * Pure, so the tests can play every level.
 */
import { DB_TIME, FORWARDS, HIT_TIME, WORKERS, fits, isClient } from './pieces';
import type { Build, Edge, Flow, Kind, LevelDef, Problem, RunResult, Trip } from './types';

/** Every piece on the board, fixed or placed, by id. */
export function kindsOf(level: LevelDef, build: Build): Map<string, Kind> {
  const kinds = new Map<string, Kind>();
  for (const p of level.pieces) kinds.set(p.id, p.kind);
  for (const [pad, kind] of Object.entries(build.placed)) kinds.set(pad, kind);
  return kinds;
}

/**
 * Shortest directed path from → to, through pieces that pass requests on. Among equally short ways the
 * least busy piece is tried first, which is how a load balancer (or a client with two addresses) spreads work.
 */
function search(
  from: string,
  to: string,
  edges: Edge[],
  kinds: Map<string, Kind>,
  ok: (e: Edge) => boolean,
  load: Map<string, number> = new Map(),
): string[] | null {
  const prev = new Map<string, string>([[from, '']]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) {
      const path = [to];
      while (path[0] !== from) path.unshift(prev.get(path[0])!);
      return path;
    }
    if (at !== from && !FORWARDS.includes(kinds.get(at)!)) continue;
    const out = edges.filter((e) => e.from === at).sort((a, b) => (load.get(a.to) ?? 0) - (load.get(b.to) ?? 0));
    for (const e of out) {
      if (e.from !== at || prev.has(e.to) || !kinds.has(e.to) || !ok(e)) continue;
      prev.set(e.to, at);
      queue.push(e.to);
    }
  }
  return null;
}

export function run(level: LevelDef, build: Build): RunResult {
  const kinds = kindsOf(level, build);
  const edges = build.edges.filter((e) => kinds.has(e.from) && kinds.has(e.to));
  const fit = (e: Edge) => fits(kinds.get(e.from)!, kinds.get(e.to)!);

  const problems: Problem[] = [];
  if (level.rules.includes('noDirectDb'))
    for (const e of edges) if (isClient(kinds.get(e.from)!) && kinds.get(e.to) === 'db') problems.push({ reason: 'exposedDb', edge: e });

  if (level.rules.includes('singleAddress'))
    for (const [id, kind] of kinds) {
      const out = edges.filter((e) => e.from === id);
      if (isClient(kind) && out.length > 1) for (const e of out) problems.push({ reason: 'twoAddresses', edge: e });
    }

  const load = new Map<string, number>();
  const warm = new Set<string>();
  let clock = 0;

  const route = (flow: Flow): Trip => {
    const good = search(flow.from, flow.to, edges, kinds, fit, load);
    if (!good) {
      // A way exists if the plugs fitted: the request walks up to the first plug that doesn't.
      const any = search(flow.from, flow.to, edges, kinds, () => true);
      if (any) {
        const i = any.findIndex((id, n) => n > 0 && !fit({ from: any[n - 1], to: id }));
        return { flow, path: any.slice(0, i), ok: false, fail: 'shape', edge: { from: any[i - 1], to: any[i] } };
      }
      // A way exists if the arrows pointed the other way.
      const flipped = edges.map((e) => ({ from: e.to, to: e.from }));
      const back = search(flow.from, flow.to, [...edges, ...flipped], kinds, () => true);
      return { flow, path: [flow.from], ok: false, fail: back ? 'reversed' : 'noPath' };
    }
    // A cache that already holds a copy answers by itself.
    let path = good;
    const c = good.findIndex((id, n) => n > 0 && kinds.get(id) === 'cache');
    const hit = c > 0 && warm.has(`${good[c]}>${flow.to}`);
    if (hit) path = good.slice(0, c + 1);
    // A worker that is already full drops the request.
    if (level.capacity !== undefined) {
      const full = path.findIndex((id) => WORKERS.includes(kinds.get(id)!) && (load.get(id) ?? 0) >= level.capacity!);
      if (full > 0) return { flow, path: path.slice(0, full + 1), ok: false, fail: 'overload' };
    }
    for (const id of path) if (WORKERS.includes(kinds.get(id)!) || kinds.get(id) === 'lb') load.set(id, (load.get(id) ?? 0) + 1);
    if (c > 0 && !hit) warm.add(`${good[c]}>${flow.to}`);
    const trip: Trip = { flow, path, ok: true, hit };
    if (level.timeLimit !== undefined) {
      trip.cost = hit ? HIT_TIME : kinds.get(flow.to) === 'db' ? DB_TIME : HIT_TIME;
      clock += trip.cost;
      trip.doneAt = clock;
      if (clock > level.timeLimit) {
        trip.ok = false;
        trip.fail = 'tooSlow';
      }
    }
    return trip;
  };

  const trips: Trip[] = [];
  for (const flow of level.flows) for (let n = 0; n < (flow.count ?? 1); n++) trips.push(route(flow));

  // A request that took the forbidden shortcut is caught by the alarm.
  for (const t of trips)
    if (t.ok && problems.some((p) => t.path.some((id, n) => n > 0 && t.path[n - 1] === p.edge.from && id === p.edge.to))) {
      t.ok = false;
      t.fail = 'exposedDb';
    }

  return { ok: problems.length === 0 && trips.every((t) => t.ok), trips, problems };
}

export const sameEdge = (a: Edge, b: Edge) => a.from === b.from && a.to === b.to;

/**
 * Taps "from" then "to": adds the edge, removes it when it's already there, and turns it around when the
 * opposite one is there.
 */
export function toggleEdge(edges: Edge[], from: string, to: string): Edge[] {
  if (from === to) return edges;
  const e = { from, to };
  if (edges.some((x) => sameEdge(x, e))) return edges.filter((x) => !sameEdge(x, e));
  return [...edges.filter((x) => !(x.from === to && x.to === from)), e];
}
