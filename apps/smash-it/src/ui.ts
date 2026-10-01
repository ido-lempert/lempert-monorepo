/**
 * The DOM screens around the game: chapter list, shop, chapter intro, HUD goals, the food tray and the
 * results card. Each function renders from the current progress and calls back for actions.
 */
import { BUGS, type BugKind } from './game/bugs';
import { areaRank, BOOST, FOOD_ORDER, FOODS, type FoodId, MAX_TIER } from './game/foods';
import { type Goal, type Level, levelById, LEVELS, WORLDS } from './game/levels';
import { FOOD_PRIZES, nextPrize, type Progress, shopOpen, SKINS, type SkinId, tierPrice, totalStars, UPGRADE_ORDER, UPGRADES, type UpgradeId, upgradePrice } from './game/progress';
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

/** "מלך הנמלים" and so on. */
export const kingName = (level: Level) => (level.boss ? t(`king_${level.boss.look}` as StringKey) : '');

export const worldName = (world: number) => t(`world_${WORLDS[world - 1].theme}` as StringKey);

export function goalText(g: Goal, level?: Level): string {
  switch (g.kind) {
    case 'boss':
      return t('goalBoss', { name: level ? kingName(level) : '' });
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
    case 'boss':
      return '👑';
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
export function renderHudGoals(level: Level, s: Session, king?: { hp: number; max: number }) {
  const box = $('hud-goals');
  if (box.childElementCount !== level.goals.length) {
    box.replaceChildren(...level.goals.map((g) => el('div', { title: goalText(g, level), 'aria-label': goalText(g, level) })));
  }
  level.goals.forEach((g, i) => {
    const [have, need] = s.progress(g);
    const done = have >= need;
    const pill = box.children[i] as HTMLElement;
    const x = g.kind === 'combo' ? '×' : '';
    let value = done ? '✓' : `${x}${num(Math.min(have, need))} / ${x}${num(need)}`;
    // A king's hearts.
    if (g.kind === 'boss' && !done && king) value = king.max <= 8 ? '❤️'.repeat(Math.max(0, king.hp)) + '🤍'.repeat(king.max - Math.max(0, king.hp)) : `❤️ ${king.hp}/${king.max}`;
    if (pill.dataset.value !== value) {
      pill.dataset.value = value;
      pill.replaceChildren(el('span', { 'aria-hidden': 'true' }, goalIcon(g)), ' ', el('b', { dir: 'ltr' }, value));
      pill.classList.toggle('done', done);
      pill.classList.toggle('hearts', g.kind === 'boss');
    }
  });
}

/** Chapters by world: every world reached so far, and a peek at the next one. */
export function renderChapters(p: Progress, onPick: (id: number) => void) {
  const lastWorld = Math.min(WORLDS.length, levelById(p.unlocked).world + 1);
  const sections: HTMLElement[] = [];
  for (const w of WORLDS.slice(0, lastWorld)) {
    const levels = LEVELS.filter((l) => l.world === w.id);
    const reached = levels[0].id <= p.unlocked;
    sections.push(
      el('h3', { class: 'world-head' }, `${t('world', { n: w.id })} · ${worldName(w.id)}${reached ? '' : ' 🔒'}`),
      el(
        'div',
        { class: 'chapter-grid' },
        ...levels.map((l) => {
          const open = l.id <= p.unlocked;
          const stars = p.stars[l.id] ?? 0;
          const b = el(
            'button',
            { class: l.boss ? 'king' : '', 'aria-label': `${t('chapter', { n: l.id })}${l.boss ? `, ${kingName(l)}` : ''}${open ? '' : `, ${t('locked')}`}` },
            el('span', {}, open ? (l.boss ? `👑 ${l.id}` : String(l.id)) : '🔒'),
            el('small', { 'aria-hidden': 'true' }, open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : ''),
          );
          b.disabled = !open;
          b.addEventListener('click', () => onPick(l.id));
          return b;
        }),
      ),
    );
  }
  $('chapter-list').replaceChildren(...sections);
  // Open at the newest chapter.
  requestAnimationFrame(() => $('chapter-list').querySelector<HTMLElement>(`button:not([disabled]):last-of-type`)?.scrollIntoView({ block: 'center' }));
}

/** A food's speed and hit size as little bars (the shop and the prize reveal). */
export function foodBars(id: FoodId): HTMLElement[] {
  const f = FOODS[id];
  return [...bars(t('speed'), f.speed), ...bars(t('area'), areaRank(f))];
}

function bars(label: string, n: number) {
  return [el('span', {}, label), el('span', { class: 'bar', 'aria-label': `${n}/3` }, ...[1, 2, 3].map((i) => el('i', { class: i <= n ? 'on' : '' })))];
}

export interface ShopActions {
  buyTier(id: FoodId): void;
  chooseFood(id: FoodId): void;
  buyUpgrade(id: UpgradeId): void;
  chooseSkin(id: SkinId): void;
}

export type ShopTab = 'foods' | 'upgrades' | 'skins';

/** The chapter after which a food is won. */
const prizeChapter = (id: FoodId) => Number(Object.entries(FOOD_PRIZES).find(([, f]) => f === id)?.[0] ?? 0);

function priceButton(price: number | null, coins: number, onBuy: () => void): HTMLButtonElement {
  const short = price === null ? 0 : price - coins;
  const btn = el('button', { class: 'primary' }, price === null ? t('maxed') : short > 0 ? `⭐ ${t('missing', { n: num(short) })}` : t('buy', { price: `⭐ ${num(price)}` }));
  btn.disabled = price === null || short > 0;
  btn.addEventListener('click', onBuy);
  return btn;
}

export function renderShop(p: Progress, tab: ShopTab, a: ShopActions) {
  $('shop-coins').textContent = num(p.coins);
  for (const id of ['foods', 'upgrades', 'skins'] as ShopTab[]) $(`tab-${id}`).setAttribute('aria-selected', String(tab === id));
  const list = $('shop-list');
  if (tab === 'foods') {
    list.replaceChildren(
      ...FOOD_ORDER.map((id) => {
        const f = FOODS[id];
        const owned = p.owned.includes(id);
        const chosen = p.food === id;
        const tier = p.tiers[id] ?? 0;
        const head = el('div', { class: 'item-head' }, el('span', { class: 'item-emoji', 'aria-hidden': 'true' }, owned ? f.emoji : '🎁'), el('h3', {}, owned ? foodName(id) : '?'));
        if (!owned) return el('div', { class: 'item locked' }, head, el('p', {}, t('foodLockedAt', { n: prizeChapter(id) })));
        const choose = el('button', { class: 'secondary' }, chosen ? `✓ ${t('chosen')}` : t('choose'));
        choose.disabled = chosen;
        choose.addEventListener('click', () => a.chooseFood(id));
        return el(
          'div',
          { class: `item${chosen ? ' selected' : ''}` },
          head,
          el('p', {}, t(`foodInfo_${id}` as StringKey)),
          el('div', { class: 'bars' }, ...bars(t('speed'), f.speed), ...bars(t('area'), areaRank(f))),
          el('p', { class: 'muted' }, `⬆️ ${t(`boost_${BOOST[id]}` as StringKey)} · ${t('tierOf', { n: tier, max: MAX_TIER })}`),
          priceButton(tierPrice(p, id), p.coins, () => a.buyTier(id)),
          choose,
        );
      }),
    );
  } else if (tab === 'upgrades') {
    list.replaceChildren(
      ...UPGRADE_ORDER.map((id) => {
        const u = UPGRADES[id];
        return el(
          'div',
          { class: 'item' },
          el('div', { class: 'item-head' }, el('span', { class: 'item-emoji', 'aria-hidden': 'true' }, u.emoji), el('h3', {}, t(`up_${id}` as StringKey))),
          el('p', {}, t(`upInfo_${id}` as StringKey)),
          el('p', { class: 'muted' }, t('tier', { n: p.upgrades[id], max: u.prices.length })),
          priceButton(upgradePrice(p, id), p.coins, () => a.buyUpgrade(id)),
        );
      }),
    );
  } else {
    const stars = totalStars(p);
    list.replaceChildren(
      ...SKINS.map((s) => {
        const open = stars >= s.stars;
        const worn = p.skin === s.id;
        const btn = el('button', { class: open ? 'secondary' : 'primary' }, !open ? t('skinNeed', { n: s.stars }) : worn ? `✓ ${t('worn')}` : t('wear'));
        btn.disabled = !open || worn;
        btn.addEventListener('click', () => a.chooseSkin(s.id));
        return el(
          'div',
          { class: `item${worn ? ' selected' : ''}${open ? '' : ' locked'}` },
          el('div', { class: 'item-head' }, el('span', { class: 'item-emoji', 'aria-hidden': 'true' }, open ? s.emoji : '🔒'), el('h3', {}, t(`skin_${s.id}` as StringKey))),
          btn,
        );
      }),
    );
  }
}

export function renderIntro(p: Progress, level: Level) {
  $('intro-kicker').textContent = `${t('world', { n: level.world })} · ${worldName(level.world)} · ${t('chapter', { n: level.id })}`;
  $('intro-title').textContent = level.boss ? kingName(level) : t('mission');
  $('intro-goals').replaceChildren(...level.goals.map((g) => el('li', {}, `${goalIcon(g)} ${goalText(g, level)}`)));
  $('intro-stars').textContent = t('starsGoal', { a: num(level.stars[0]), b: num(level.stars[1]) });
  const prize = nextPrize(p);
  $('intro-prize').classList.toggle('hidden', !prize);
  if (prize) $('intro-prize').textContent = `🎁 ${t('nextPrize', { emoji: FOODS[prize.food].emoji, food: foodName(prize.food), n: prize.after })}`;
  const best = p.best[level.id];
  $('intro-best').textContent = best ? t('best', { n: num(best) }) : '';
  $('intro-shop').classList.toggle('hidden', !shopOpen(p));
  // After failing a chapter twice in a row, offer a longer aiming guide (openly, and only if wanted).
  const help = p.fails.level === level.id && p.fails.n >= 2 && level.guide < 0.85;
  $('intro-assist').classList.toggle('hidden', !help);
  $('intro-assist-note').classList.toggle('hidden', !help);
}

/** The star meter in the HUD: how far the score is towards the 2nd and 3rd star. Returns the stars reached. */
export function updateStarMeter(level: Level, score: number): number {
  const [two, three] = level.stars;
  const meter = $('star-meter');
  meter.style.setProperty('--fill', `${Math.min(100, (score / three) * 100)}%`);
  meter.style.setProperty('--m2', `${(two / three) * 100}%`);
  const reached = score >= three ? 3 : score >= two ? 2 : 1;
  meter.querySelector('.m2')!.classList.toggle('on', reached >= 2);
  meter.querySelector('.m3')!.classList.toggle('on', reached >= 3);
  return reached;
}

/** Every bug met, how often it was hit, and the kings beaten. */
export function renderAlbum(p: Progress) {
  const kinds: BugKind[] = ['snail', 'ladybug', 'ant', 'beetle', 'butterfly', 'fly', 'golden'];
  const kings = LEVELS.filter((l) => l.boss && (p.stars[l.id] ?? 0) > 0);
  $('album-list').replaceChildren(
    ...kinds.map((k) => {
      const n = p.album[k] ?? 0;
      return n
        ? el('div', { class: 'album-item' }, el('div', { class: 'emoji', 'aria-hidden': 'true' }, BUGS[k].emoji), el('h3', {}, t(`bug_${k}` as StringKey)), el('p', {}, t('albumHits', { n: num(n) })), el('p', { class: 'muted' }, t(`bugAbout_${k}` as StringKey)))
        : el('div', { class: 'album-item unknown' }, el('div', { class: 'emoji', 'aria-hidden': 'true' }, '❔'), el('h3', {}, '?'), el('p', {}, t('albumUnknown')));
    }),
    el('p', { class: 'album-kings' }, `👑 ${t('kingsBeaten')}: ${kings.length ? kings.map((l) => `${kingName(l)} (${l.id})`).join(' · ') : '–'}`),
  );
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
  level: Level;
  session: Session;
  coins: number;
  stars: number;
  newBest: boolean;
  unlocked: number | null;
  lastChapter: boolean;
  /** The shop has something the coins can buy. */
  canBuy: boolean;
  /** The daily challenge: a new best of the day, and that best. */
  daily?: { best: number; isNew: boolean };
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
  // What was done and what was missing.
  $('result-goals').replaceChildren(
    ...r.level.goals.map((g) => {
      const [have, need] = s.progress(g);
      const done = have >= need;
      const x = g.kind === 'combo' ? '×' : '';
      return el('li', { class: done ? 'done' : 'miss' }, `${done ? '✓' : '✗'} ${goalText(g, r.level)}`, g.kind === 'boss' ? '' : el('span', { dir: 'ltr' }, ` (${x}${num(Math.min(have, need))}/${x}${num(need)})`));
    }),
  );
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
  // The next star, so there's always something to aim for.
  const [two, three] = r.level.stars;
  $('result-star-note').textContent = !r.success ? '' : s.score < two ? t('nextStar2', { n: num(two - s.score) }) : s.score < three ? t('nextStar3', { n: num(three - s.score) }) : t('allStars');
  const notes: string[] = [];
  if (r.daily) notes.push(r.daily.isNew ? t('dailyNew') : t('dailyBest', { n: num(r.daily.best) }));
  else if (r.lastChapter && r.success) notes.push(t('allClear'));
  else if (r.unlocked) notes.push(t('unlocked', { n: r.unlocked }));
  if (r.newBest) notes.push(t('newBest'));
  if (r.canBuy) notes.push(t('coachShop'));
  $('result-note').textContent = notes.join(' · ');
  $('result-next').textContent = r.daily ? t('back') : r.success ? (r.lastChapter ? t('back') : t('next')) : t('retry');
  $('result-again').classList.toggle('hidden', !r.success || r.stars >= 3 || !!r.daily);
  const shop = $('result-shop');
  shop.classList.toggle('hidden', !r.canBuy);
  shop.classList.toggle('glow', r.canBuy);
}

export function clock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
