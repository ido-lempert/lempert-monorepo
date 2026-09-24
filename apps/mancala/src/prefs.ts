/** Display preferences: colour theme and motion. Both follow the operating system unless overridden. */

export type ThemePref = 'system' | 'light' | 'dark';
export type MotionPref = 'system' | 'reduce' | 'full';

const KEY = 'mancala.display';
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

interface Stored {
  theme: ThemePref;
  motion: MotionPref;
}

let stored: Stored = { theme: 'system', motion: 'system' };
try {
  stored = { ...stored, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
} catch {
  /* defaults */
}

const listeners = new Set<() => void>();
const notify = () => {
  apply();
  listeners.forEach((fn) => fn());
};
darkQuery.addEventListener('change', notify);
motionQuery.addEventListener('change', notify);

export function onDisplayChange(fn: () => void) {
  listeners.add(fn);
}

export function themePref(): ThemePref {
  return stored.theme;
}

export function isLight(): boolean {
  return stored.theme === 'light' || (stored.theme === 'system' && !darkQuery.matches);
}

export function reducedMotion(): boolean {
  return stored.motion === 'reduce' || (stored.motion === 'system' && motionQuery.matches);
}

export function setTheme(theme: ThemePref) {
  stored.theme = theme;
  save();
}

export function setReducedMotion(reduce: boolean) {
  // Store an explicit choice only when it differs from the system; otherwise keep following the system.
  stored.motion = reduce === motionQuery.matches ? 'system' : reduce ? 'reduce' : 'full';
  save();
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(stored));
  notify();
}

/** Reflects the preferences on <html> so CSS can use them. */
export function apply() {
  const root = document.documentElement;
  root.dataset.theme = isLight() ? 'light' : 'dark';
  root.classList.toggle('reduce-motion', reducedMotion());
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLight() ? '#f1ece2' : '#1b1e2b');
}
