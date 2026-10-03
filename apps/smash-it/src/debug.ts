/**
 * Developer tools: a rolling log of everything that can explain "the world disappeared" on a real phone (errors,
 * WebGL context loss, quality drops, long frames, memory over time, taps), a live overlay with the numbers, and a
 * report to copy or download. The log is collected all the time (it is cheap) and kept in localStorage, so after a
 * reload the report still has the end of the session that went wrong. The overlay is only drawn in developer mode.
 */

export interface GfxStats {
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  programs: number;
  meshes: number;
  meshesTotal: number;
  instances: number;
  casters: number;
  /** Geometries and textures still referenced by the scene (compare with the numbers on the graphics chip to spot leaks). */
  sceneGeometries: number;
  sceneTextures: number;
  /** A rough guess at graphics memory, in MB. */
  geometryMB: number;
  textureMB: number;
  canvasMB: number;
  shadowMB: number;
  canvas: string;
  pixelRatio: number;
  resScale: number;
  quality: string;
  battery: boolean;
  lost: boolean;
  /** Time spent building and submitting a frame (CPU side), average in ms. */
  cpuMs: number;
}

export interface Hooks {
  stats: () => GfxStats | null;
  /** Game state for the report: chapter, mode, progress... */
  context: () => Record<string, unknown>;
}

type Kind = 'info' | 'warn' | 'error' | 'gl' | 'perf' | 'ui' | 'life';
interface Entry {
  /** Seconds since the page started. */
  t: number;
  k: Kind;
  msg: string;
}

const STORE_KEY = 'smashIt.debugLog';
const MAX_ENTRIES = 300;
const START = performance.now();
const startedAt = new Date();

const entries: Entry[] = [];
let previous: { at: string; version: string; ua: string; entries: Entry[] } | null = null;
let hooks: Hooks | null = null;
let saveTimer = 0;

try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) previous = JSON.parse(raw);
} catch {
  /* nothing saved, or unreadable */
}

function persist(now: boolean) {
  const write = () => {
    saveTimer = 0;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ at: startedAt.toISOString(), version: __APP_VERSION__, ua: navigator.userAgent, entries }));
    } catch {
      /* storage full or blocked */
    }
  };
  if (now) {
    clearTimeout(saveTimer);
    write();
  } else if (!saveTimer) saveTimer = window.setTimeout(write, 3000);
}

export function log(k: Kind, msg: string) {
  entries.push({ t: (performance.now() - START) / 1000, k, msg: msg.length > 600 ? `${msg.slice(0, 600)}…` : msg });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  persist(k === 'error' || k === 'gl' || k === 'life');
}

// --- Collecting ----------------------------------------------------------------------------------------

const text = (v: unknown): string => {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack.split('\n').slice(1, 5).join('\n')}` : ''}`;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const describe = (el: EventTarget | null): string => {
  if (!(el instanceof Element)) return '?';
  const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${label ? ` "${label}"` : ''}`;
};

const taps = { count: 0, canvas: 0, lastAt: 0, last: '', x: 0, y: 0 };
const frames: number[] = [];
let lastFrame = 0;
let longFrames = 0;
let longTasks = 0;

window.addEventListener('error', (e) => {
  if (e.target && e.target !== window && e.target instanceof Element) {
    const src = (e.target as HTMLImageElement).src ?? (e.target as HTMLLinkElement).href ?? '';
    log('error', `failed to load <${e.target.tagName.toLowerCase()}> ${src}`);
  } else log('error', `${e.message} at ${(e.filename ?? '').split('/').pop()}:${e.lineno}:${e.colno}${e.error?.stack ? `\n${text(e.error)}` : ''}`);
}, true);
window.addEventListener('unhandledrejection', (e) => log('error', `unhandled promise rejection: ${text(e.reason)}`));
window.addEventListener('securitypolicyviolation', (e) => log('error', `blocked by policy: ${e.violatedDirective} ${e.blockedURI}`));
for (const level of ['error', 'warn'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    log(level, `console.${level}: ${args.map(text).join(' ')}`);
    original(...args);
  };
}
document.addEventListener('visibilitychange', () => log('life', `page ${document.visibilityState}`));
window.addEventListener('pagehide', (e) => log('life', `pagehide${e.persisted ? ' (kept in the back/forward cache)' : ''}`));
window.addEventListener('pageshow', (e) => log('life', `pageshow${e.persisted ? ' (restored from the cache)' : ''}`));
document.addEventListener('freeze', () => log('life', 'page frozen by the browser'));
document.addEventListener('resume', () => log('life', 'page resumed'));
window.addEventListener('online', () => log('info', 'online'));
window.addEventListener('offline', () => log('info', 'offline'));
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => log('info', `viewport ${innerWidth}x${innerHeight} @${devicePixelRatio}x`), 400);
});
let resizeTimer = 0;
document.addEventListener(
  'pointerdown',
  (e) => {
    taps.count++;
    taps.lastAt = performance.now();
    taps.x = Math.round(e.clientX);
    taps.y = Math.round(e.clientY);
    taps.last = describe(e.target);
    if ((e.target as HTMLElement)?.tagName === 'CANVAS') taps.canvas++;
    else log('ui', `tap ${taps.last}`);
  },
  true,
);
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      longTasks++;
      if (longTasks <= 20 || longTasks % 10 === 0) log('perf', `long task ${Math.round(e.duration)}ms (#${longTasks})`);
    }
  }).observe({ entryTypes: ['longtask'] });
} catch {
  /* not supported */
}

/** Call once per drawn frame. */
export function frame(now: number) {
  if (lastFrame) {
    const ms = now - lastFrame;
    if (ms < 2000) {
      frames.push(ms);
      if (frames.length > 180) frames.shift();
      if (ms > 50) longFrames++;
    }
  }
  lastFrame = now;
}

function fps() {
  if (!frames.length) return { fps: 0, avg: 0, p95: 0, worst: 0 };
  const sorted = [...frames].sort((a, b) => a - b);
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  return { fps: 1000 / avg, avg, p95: sorted[Math.floor(sorted.length * 0.95)], worst: sorted[sorted.length - 1] };
}

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}
const memory = () => (performance as unknown as { memory?: MemoryInfo }).memory;
const mb = (n: number) => (n / 1048576).toFixed(1);

function summary(): string {
  const f = fps();
  const g = hooks?.stats();
  const m = memory();
  const parts = [`fps ${f.fps.toFixed(0)} (avg ${f.avg.toFixed(1)}ms p95 ${f.p95.toFixed(0)}ms worst ${f.worst.toFixed(0)}ms)`];
  if (g) {
    parts.push(
      `cpu ${g.cpuMs.toFixed(1)}ms calls ${g.calls} tris ${(g.triangles / 1000).toFixed(0)}k`,
      `geo ${g.geometries}/${g.sceneGeometries} tex ${g.textures}/${g.sceneTextures} prog ${g.programs}`,
      `meshes ${g.meshes}/${g.meshesTotal} inst ${g.instances} casters ${g.casters}`,
      `gpu~${(g.geometryMB + g.textureMB + g.canvasMB + g.shadowMB).toFixed(0)}MB (geo ${g.geometryMB.toFixed(0)} tex ${g.textureMB.toFixed(0)} canvas ${g.canvasMB.toFixed(0)} shadow ${g.shadowMB.toFixed(0)})`,
      `${g.quality} res ${g.resScale.toFixed(2)} pr ${g.pixelRatio.toFixed(2)} ${g.canvas}${g.battery ? ' battery' : ''}${g.lost ? ' CONTEXT LOST' : ''}`,
    );
  }
  if (m) parts.push(`heap ${mb(m.usedJSHeapSize)}/${mb(m.totalJSHeapSize)}MB (limit ${mb(m.jsHeapSizeLimit)})`);
  parts.push(`long frames ${longFrames} long tasks ${longTasks} taps ${taps.count} (canvas ${taps.canvas})`);
  return parts.join('\n');
}

// A line every 5 seconds: the trend before a crash (growing geometries or textures, heap, falling fps) is what explains it.
setInterval(() => {
  if (document.hidden) return;
  const f = fps();
  const g = hooks?.stats();
  const m = memory();
  log(
    'perf',
    [
      `fps ${f.fps.toFixed(0)} p95 ${f.p95.toFixed(0)}ms`,
      g && `calls ${g.calls} tris ${(g.triangles / 1000).toFixed(0)}k geo ${g.geometries}/${g.sceneGeometries} tex ${g.textures}/${g.sceneTextures} prog ${g.programs} gpu~${(g.geometryMB + g.textureMB + g.canvasMB + g.shadowMB).toFixed(0)}MB ${g.quality} res ${g.resScale.toFixed(2)}${g.lost ? ' LOST' : ''}`,
      m && `heap ${mb(m.usedJSHeapSize)}MB`,
    ]
      .filter(Boolean)
      .join(' | '),
  );
}, 5000);

export function attach(h: Hooks) {
  hooks = h;
  log('info', `start v${__APP_VERSION__} ${innerWidth}x${innerHeight} @${devicePixelRatio}x cores ${navigator.hardwareConcurrency} mem ${(navigator as { deviceMemory?: number }).deviceMemory ?? '?'}GB ${navigator.userAgent}`);
}

// --- Report --------------------------------------------------------------------------------------------

const line = (e: Entry) => `${e.t.toFixed(1).padStart(7)}s ${e.k.padEnd(5)} ${e.msg}`;

export function report(): string {
  const out: string[] = [];
  out.push(`Smash It debug report`, `version ${__APP_VERSION__}  ${new Date().toISOString()}  up ${((performance.now() - START) / 1000).toFixed(0)}s`);
  out.push(`ua ${navigator.userAgent}`);
  out.push(`screen ${screen.width}x${screen.height}  viewport ${innerWidth}x${innerHeight}  dpr ${devicePixelRatio}  cores ${navigator.hardwareConcurrency}  deviceMemory ${(navigator as { deviceMemory?: number }).deviceMemory ?? '?'}GB`);
  const c = hooks?.context();
  if (c) out.push('', '== game ==', ...Object.entries(c).map(([k, v]) => `${k}: ${text(v)}`));
  out.push('', '== now ==', summary());
  const last = taps.lastAt ? `${taps.last} at ${taps.x},${taps.y} ${((performance.now() - taps.lastAt) / 1000).toFixed(1)}s ago` : 'none';
  out.push(`last tap: ${last}`);
  out.push('', `== log (this session, ${entries.length} lines) ==`, ...entries.map(line));
  if (previous?.entries.length) {
    out.push('', `== previous session (started ${previous.at}, v${previous.version}) – the last ${Math.min(120, previous.entries.length)} lines ==`, ...previous.entries.slice(-120).map(line));
  }
  return out.join('\n');
}

export function clearLog() {
  entries.length = 0;
  previous = null;
  longFrames = 0;
  longTasks = 0;
  log('info', 'log cleared');
  persist(true);
}

export const lineCount = () => entries.length;

export async function copy(): Promise<boolean> {
  const body = report();
  try {
    await navigator.clipboard.writeText(body);
    return true;
  } catch {
    /* no clipboard permission (or not a secure page): try the old way */
  }
  const area = document.createElement('textarea');
  area.value = body;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export function download() {
  const url = URL.createObjectURL(new Blob([report()], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `smash-it-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const canShare = () => typeof navigator.share === 'function';

export async function share(): Promise<boolean> {
  try {
    await navigator.share({ title: 'Smash It debug report', text: report() });
    return true;
  } catch {
    return false;
  }
}

// --- Overlay -------------------------------------------------------------------------------------------

let box: HTMLElement | null = null;
let readout: HTMLElement | null = null;
let timer = 0;
let compact = true;

function draw() {
  if (!readout) return;
  const body = summary();
  readout.textContent = compact ? body.split('\n').slice(0, 2).join('\n') : body;
}

export function setOverlay(on: boolean, onCopied?: (ok: boolean) => void) {
  if (!on) {
    clearInterval(timer);
    box?.remove();
    box = readout = null;
    return;
  }
  if (box) return;
  box = document.createElement('div');
  box.className = 'debug-hud';
  box.setAttribute('dir', 'ltr');
  readout = document.createElement('pre');
  const buttons = document.createElement('div');
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'copy';
  copyBtn.addEventListener('click', () => void copy().then((ok) => onCopied?.(ok)));
  const sizeBtn = document.createElement('button');
  sizeBtn.textContent = 'more';
  sizeBtn.addEventListener('click', () => {
    compact = !compact;
    sizeBtn.textContent = compact ? 'more' : 'less';
    draw();
  });
  buttons.append(copyBtn, sizeBtn);
  box.append(readout, buttons);
  document.body.appendChild(box);
  draw();
  timer = window.setInterval(draw, 500);
}
