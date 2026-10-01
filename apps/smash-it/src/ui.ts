/**
 * The DOM screens around the game: chapter list, shop, chapter intro, HUD goals, the food tray and the
 * results card. Each function renders from the current progress and calls back for actions.
 */
import { BUGS } from './game/bugs';
import { areaRank, FOOD_ORDER, FOODS, type FoodId } from './game/foods';
import { type Goal, type Level, LEVELS } from './game/levels';
import { type Progress, shopOpen, UPGRADE_ORDER, UPGRADES, type UpgradeId, upgradePrice, upgradesOpen } from './game/progress';
import type { Session } from './game/session';
import { type StringKey, t } from './i18n';

const $ = (id: string) => document.getElementById(id)!;

export const num = (n: number) => Math.round(n).toLocaleString('he-IL');

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

export const foodName = (id: FoodId) => t(`food_${id}` as StringKey);

export function goalText(g: Goal): string {
  switch (g.kind) {
    case 'hits':
      return t('goalHits', { n: g.n });
    case 'score':
      return t('goalScore', { n: num(g.n) });
    case 'bug':
      return g.bug === 'small' ? t('goalSmall', { n: g.n }) : t('goalBug', { n: g.n, bug: t(`bugs_${g.bug}` as StringKey) });
    case 'combo':
      return t('goalCombo', { n: g.n });
    case 'multi':
      return t('goalMulti', { n: g.n });
  }
}

function goalIcon(g: Goal): string {
  switch (g.kind) {
    case 'hits':
      return '🎯';
    case 'score':
      return '⭐';
    case 'bug':
      return g.bug === 'small' ? '🔍' : BUGS[g.bug].emoji;
    case 'combo':
      return '🔥';
    case 'multi':
      return '💥';
  }
}

/** The goal pills at the top while playing. */
export function renderHudGoals(level: Level, s: Session) {
  const box = $('hud-goals');
  if (box.childElementCount !== level.goals.length) {
    box.replaceChildren(...level.goals.map((g) => el('div', { title: goalText(g), 'aria-label': goalText(g) })));
  }
  level.goals.forEach((g, i) => {
    const [have, need] = s.progress(g);
    const done = have >= need;
    const pill = box.children[i] as HTMLElement;
    const x = g.kind === 'combo' ? '×' : '';
    const text = `${goalIcon(g)} ${done ? '✓' : `${x}${num(Math.min(have, need))} / ${x}${num(need)}`}`;
    if (pill.textContent !== text) {
      pill.replaceChildren(el('span', { 'aria-hidden': 'true' }, goalIcon(g)), ' ', el('b', { dir: 'ltr' }, done ? '✓' : `${x}${num(Math.min(have, need))} / ${x}${num(need)}`));
      pill.classList.toggle('done', done);
    }
  });
}

export function renderChapters(p: Progress, onPick: (id: number) => void) {
  $('chapter-grid').replaceChildren(
    ...LEVELS.map((l) => {
      const open = l.id <= p.unlocked;
      const stars = p.stars[l.id] ?? 0;
      const b = el(
        'button',
        { 'aria-label': `${t('chapter', { n: l.id })}${open ? '' : `, ${t('locked')}`}` },
        el('span', {}, open ? String(l.id) : '🔒'),
        el('small', { 'aria-hidden': 'true' }, open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : ''),
      );
      b.disabled = !open;
      b.addEventListener('click', () => onPick(l.id));
      return b;
    }),
  );
}

function bars(label: string, n: number) {
  return [el('span', {}, label), el('span', { class: 'bar', 'aria-label': `${n}/3` }, ...[1, 2, 3].map((i) => el('i', { class: i <= n ? 'on' : '' })))];
}

export interface ShopActions {
  buyFood(id: FoodId): void;
  chooseFood(id: FoodId): void;
  buyUpgrade(id: UpgradeId): void;
}

export function renderShop(p: Progress, tab: 'foods' | 'upgrades', a: ShopActions) {
  $('shop-coins').textContent = num(p.coins);
  // Upgrades come later; until then the shop is just food.
  $('tab-upgrades').parentElement!.classList.toggle('hidden', !upgradesOpen(p));
  if (!upgradesOpen(p)) tab = 'foods';
  $('tab-foods').setAttribute('aria-selected', String(tab === 'foods'));
  $('tab-upgrades').setAttribute('aria-selected', String(tab === 'upgrades'));
  const list = $('shop-list');
  if (tab === 'foods') {
    list.replaceChildren(
      ...FOOD_ORDER.map((id) => {
        const f = FOODS[id];
        const owned = p.owned.includes(id);
        const chosen = p.food === id;
        let btn: HTMLButtonElement;
        if (!owned) {
          const short = f.price - p.coins;
          btn = el('button', { class: 'primary' }, short > 0 ? `⭐ ${t('missing', { n: num(short) })}` : t('buy', { price: `⭐ ${num(f.price)}` }));
          btn.disabled = short > 0;
          btn.addEventListener('click', () => a.buyFood(id));
        } else {
          btn = el('button', { class: 'secondary' }, chosen ? `✓ ${t('chosen')}` : t('choose'));
          btn.disabled = chosen;
          btn.addEventListener('click', () => a.chooseFood(id));
        }
        return el(
          'div',
          { class: `item${chosen ? ' selected' : ''}` },
          el('div', { class: 'item-head' }, el('span', { class: 'item-emoji', 'aria-hidden': 'true' }, f.emoji), el('h3', {}, foodName(id))),
          el('p', {}, t(`foodInfo_${id}` as StringKey)),
          el('div', { class: 'bars' }, ...bars(t('speed'), f.speed), ...bars(t('area'), areaRank(f))),
          btn,
        );
      }),
    );
  } else {
    list.replaceChildren(
      ...UPGRADE_ORDER.map((id) => {
        const u = UPGRADES[id];
        const price = upgradePrice(p, id);
        const btn = el('button', { class: 'primary' }, price === null ? t('maxed') : p.coins < price ? `⭐ ${t('missing', { n: num(price - p.coins) })}` : t('buy', { price: `⭐ ${num(price)}` }));
        btn.disabled = price === null || p.coins < price;
        btn.addEventListener('click', () => a.buyUpgrade(id));
        return el(
          'div',
          { class: 'item' },
          el('div', { class: 'item-head' }, el('span', { class: 'item-emoji', 'aria-hidden': 'true' }, u.emoji), el('h3', {}, t(`up_${id}` as StringKey))),
          el('p', {}, t(`upInfo_${id}` as StringKey)),
          el('p', { class: 'muted' }, t('tier', { n: p.upgrades[id], max: u.prices.length })),
          btn,
        );
      }),
    );
  }
}

export function renderIntro(p: Progress, level: Level) {
  $('intro-kicker').textContent = `${t('chapter', { n: level.id })} · ${t('timeLimit', { t: clock(level.time) })}`;
  $('intro-goals').replaceChildren(...level.goals.map((g) => el('li', {}, `${goalIcon(g)} ${goalText(g)}`)));
  $('intro-shop').classList.toggle('hidden', !shopOpen(p));
  const best = p.best[level.id];
  $('intro-best').textContent = best ? t('best', { n: num(best) }) : '';
}

/** The food buttons at the bottom while playing. */
export function renderTray(p: Progress, selected: FoodId, onPick: (id: FoodId) => void) {
  // Nothing to choose from yet with a single food.
  $('tray').classList.toggle('hidden', p.owned.length < 2);
  $('tray').replaceChildren(
    ...p.owned.map((id, i) => {
      const b = el('button', { 'aria-pressed': String(id === selected), 'aria-label': foodName(id), title: foodName(id), 'data-food': id }, FOODS[id].emoji, el('kbd', { 'aria-hidden': 'true' }, String(i + 1)));
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => onPick(id));
      return b;
    }),
  );
}

export function updateTray(selected: FoodId, reload: number) {
  for (const b of $('tray').children as HTMLCollectionOf<HTMLElement>) {
    const on = b.dataset.food === selected;
    b.setAttribute('aria-pressed', String(on));
    b.style.setProperty('--reload', on ? `${Math.round(reload * 100)}%` : '0%');
  }
}

export interface ResultInfo {
  success: boolean;
  session: Session;
  coins: number;
  stars: number;
  newBest: boolean;
  unlocked: number | null;
  lastChapter: boolean;
  /** A food the coins can now buy (the results offer the shop). */
  canBuy: FoodId | null;
}

export function renderResult(r: ResultInfo) {
  const title = $('result-title');
  title.textContent = r.success ? t('success') : t('tryAgain');
  title.classList.toggle('fail', !r.success);
  $('result-stars').replaceChildren(
    ...[1, 2, 3].map((i) => {
      const s = el('span', { class: i <= r.stars ? '' : 'off' }, '⭐');
      s.style.animationDelay = `${0.3 + i * 0.25}s`;
      return s;
    }),
  );
  $('result-stars').setAttribute('aria-label', `${r.stars}/3`);
  const s = r.session;
  const coins = el('dd', { dir: 'ltr' }, '0');
  $('result-stats').replaceChildren(
    el('dt', {}, `🎯 ${t('statBugs')}`),
    el('dd', {}, num(s.hits)),
    el('dt', {}, `💥 ${t('statBest')}`),
    el('dd', {}, num(s.bestShot)),
    el('dt', {}, `🔥 ${t('statCombo')}`),
    el('dd', { dir: 'ltr' }, `×${Math.max(1, Math.min(5, s.maxChain))}`),
    el('dt', {}, `⭐ ${t('statScore')}`),
    el('dd', {}, num(s.score)),
    el('dt', {}, `🪙 ${t('statCoins')}`),
    coins,
  );
  // Count the coins up.
  const start = performance.now();
  const count = () => {
    const k = Math.min(1, (performance.now() - start) / 900);
    coins.textContent = `+${num(r.coins * k)}`;
    if (k < 1) requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  const notes: string[] = [];
  if (r.lastChapter && r.success) notes.push(t('allClear'));
  else if (r.unlocked) notes.push(t('unlocked', { n: r.unlocked }));
  if (r.newBest) notes.push(t('newBest'));
  if (r.canBuy) notes.push(t('coachShop', { food: foodName(r.canBuy) }));
  $('result-note').textContent = notes.join(' · ');
  const shop = $('result-shop');
  shop.classList.toggle('hidden', !r.canBuy);
  shop.classList.toggle('glow', !!r.canBuy);
  $('result-next').textContent = r.success ? (r.lastChapter ? t('back') : t('next')) : t('retry');
}

export function clock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
