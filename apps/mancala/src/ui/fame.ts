import type { Difficulty } from '../game/ai';
import { t } from '../i18n';

interface FameEntry {
  name: string;
  wins: number;
  computer: number;
  online: number;
}

const API = '/api/fame';
const QUEUE_KEY = 'mancala.fameQueue';

type Report = { name: string; difficulty: Difficulty };

function queued(): Report[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

async function send(report: Report): Promise<boolean> {
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Reports a win against the computer; if offline, it is kept and sent when the connection returns. */
export async function reportComputerWin(name: string, difficulty: Difficulty): Promise<boolean> {
  if (navigator.onLine && (await send({ name, difficulty }))) return true;
  localStorage.setItem(QUEUE_KEY, JSON.stringify([...queued(), { name, difficulty }].slice(-20)));
  return false;
}

export async function flushQueuedWins() {
  const pending = queued();
  if (!pending.length || !navigator.onLine) return;
  const failed: Report[] = [];
  for (const r of pending) if (!(await send(r))) failed.push(r);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
}
window.addEventListener('online', () => void flushQueuedWins());

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', attrs: Record<string, string> = {}) {
  const e = document.createElement(tag);
  e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** Fills `root` with the ranking table (names are user input, so everything is set as text). */
export async function renderFame(root: HTMLElement) {
  const note = el('p', t('fameNote'), { class: 'note' });
  if (!navigator.onLine) {
    root.replaceChildren(el('p', t('fameOffline')), note);
    return;
  }
  root.replaceChildren(el('p', t('fameLoading'), { role: 'status' }));
  let list: FameEntry[];
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    list = await res.json();
  } catch {
    root.replaceChildren(el('p', t('fameError')), note);
    return;
  }
  if (!list.length) {
    root.replaceChildren(el('p', t('fameEmpty')), note);
    return;
  }
  const table = el('table', '', { class: 'fame' });
  const head = el('tr');
  for (const [text, scope] of [['#', 'col'], [t('fameName'), 'col'], [t('fameWins'), 'col'], [t('fameComputer'), 'col'], [t('fameOnline'), 'col']]) {
    head.append(el('th', text, { scope }));
  }
  table.append(el('thead'), el('tbody'));
  table.tHead!.append(head);
  list.forEach((e, i) => {
    const row = el('tr');
    row.append(el('td', String(i + 1)), el('th', e.name, { scope: 'row', dir: 'auto' }), el('td', String(e.wins)), el('td', String(e.computer)), el('td', String(e.online)));
    table.tBodies[0].append(row);
  });
  root.replaceChildren(table, note);
}
