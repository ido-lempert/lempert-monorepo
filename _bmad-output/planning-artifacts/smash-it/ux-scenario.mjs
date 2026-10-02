/**
 * Scenario for the UX probe (.claude/skills/ux-behavior-report): drives Smash It through every screen.
 * Needs the dev server (it uses window.__game, which only exists in dev).
 *
 *   node .claude/skills/ux-behavior-report/scripts/probe.mjs --url http://localhost:5175 \
 *     --scenario _bmad-output/planning-artifacts/smash-it/ux-scenario.mjs --out "$SCRATCH/ux" --channel chrome
 */
const KEY = 'smashIt.progress';
const PREFS = 'smashIt.prefs';
const PLAYER = 'smashIt.player';
const today = new Date().toISOString().slice(0, 10);

/** A player who has seen everything: all chapters up to 40, many stars, every bug in the album. */
const veteran = {
  v: 1, coins: 4200, owned: ['cookie', 'popcorn', 'jelly', 'watermelon', 'cheese', 'donut', 'pie', 'pizza'],
  upgrades: { guide: 1, combo: 1 }, tiers: { cookie: 1 }, unlocked: 40,
  stars: Object.fromEntries(Array.from({ length: 39 }, (_, i) => [i + 1, 1 + (i % 3)])),
  best: Object.fromEntries(Array.from({ length: 39 }, (_, i) => [i + 1, 1200 + i * 90])),
  food: 'watermelon', skin: 'candy',
  album: { snail: 40, ladybug: 22, ant: 51, beetle: 12, butterfly: 9, fly: 31, golden: 3, king: 2 },
  daily: { date: today, best: 18450 }, fails: { level: 0, n: 0 },
  seen: ['intro', 'shop', 'aim', 'mop', 'rotate', 'fence', 'tray', 'combo'],
};

const sleep = (page, ms) => page.waitForTimeout(ms);

async function load(page, url, save, extra = {}) {
  await page.goto(url);
  await page.evaluate(
    ([k, v, pk, pv, plk, plv]) => {
      if (v) localStorage.setItem(k, JSON.stringify(v));
      else localStorage.removeItem(k);
      localStorage.setItem(pk, JSON.stringify(pv));
      if (plv) localStorage.setItem(plk, JSON.stringify(plv));
      else localStorage.removeItem(plk);
    },
    [KEY, save, PREFS, extra.prefs ?? {}, PLAYER, extra.player ?? null],
  );
  await page.reload();
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 20000 });
  await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 5000 }).catch(() => {});
  await sleep(page, 500);
}

const click = (page, sel) => page.click(sel, { timeout: 4000 });

/** Shoots at several spots and waits, so combos, popups and tips all happen. */
async function fight(page, seconds, every = 600) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < seconds * 1000) {
    await page.evaluate((i) => {
      const g = window.__game;
      const bugs = g.play?.arena?.bugs ?? [];
      const alive = bugs.filter((b) => b.state === 'walk' || b.state === 'enter');
      const b = alive[i % Math.max(1, alive.length)];
      if (b) g.shootAt(b.x, b.z);
    }, i++);
    await sleep(page, every);
  }
}

export default async function (page, capture, info) {
  const { url } = info;

  // --- 1. The very first visit: one big button -------------------------------------------------------
  await load(page, url, null);
  await capture('01-home-first');
  await click(page, '#menu-btn');
  await capture('02-menu-first');
  await click(page, '#menu [data-close]');

  // The first game goes straight in; the mission is told while playing.
  await click(page, '#home-play');
  await capture('03-play-first-0s', { wait: 700 });
  await capture('04-play-first-3s', { wait: 3000 });
  await fight(page, 4, 700);
  await capture('05-play-first-after-shots', { wait: 200 });

  // --- 2. A veteran: every part of the game is open ----------------------------------------------------
  await load(page, url, veteran, { player: { id: 'ux-probe-0001', name: 'נמלה טסה 7', joined: true } });
  await capture('10-home-veteran');
  await click(page, '#menu-btn');
  await capture('11-menu-veteran');
  await click(page, '[data-page=privacy]');
  await capture('12-page-privacy');
  await click(page, '#page [data-close]');
  await click(page, '#home-chapters');
  await capture('13-chapters');
  await click(page, '#chapters [data-close]');
  await click(page, '#home-shop');
  await capture('14-shop-foods');
  await click(page, '#tab-upgrades');
  await capture('15-shop-upgrades');
  await click(page, '#tab-skins');
  await capture('16-shop-skins');
  await click(page, '#shop [data-close]');
  await click(page, '#home-album');
  await capture('17-album');
  await click(page, '#album [data-close]');
  await click(page, '#home-board');
  await sleep(page, 400);
  await capture('18-board');
  await click(page, '#board-tab-all');
  await capture('19-board-all');
  await click(page, '#board [data-close]');
  await click(page, '#home-board');
  await click(page, '#board-rename');
  await capture('20-join-form');
  await click(page, '#join-later');

  // --- 3. A chapter: intro, play (hard chapter with obstacles and a king), pause --------------------------
  await click(page, '#home-play');
  await capture('21-intro');
  await click(page, '#intro-go');
  await capture('22-play-0s', { wait: 600 });
  await fight(page, 7, 500);
  await capture('23-play-fighting', { wait: 100 });
  await capture('24-play-fighting-b', { wait: 900 });
  await click(page, '#pause-btn');
  await capture('25-pause');
  await click(page, '#pause-resume');

  // A king chapter (every 10th) and a rotating one.
  await page.evaluate(() => window.__game.start(30));
  await capture('26-play-king', { wait: 1800 });
  await fight(page, 4, 400);
  await capture('27-play-king-fighting', { wait: 100 });

  // --- 4. End of a chapter: replay, results (win and lose), prizes, mop -------------------------------------
  await page.evaluate(() => {
    const g = window.__game;
    g.play.arena.session.timeLeft = 0.2;
  });
  await sleep(page, 600);
  await capture('30-replay', { wait: 900 });
  await click(page, '#replay-skip').catch(() => {});
  await capture('31-result-lose', { wait: 800 });
  await click(page, '#result-next');
  await capture('32-mop', { wait: 1200 });
  await click(page, '#mop-skip').catch(() => {});

  await load(page, url, veteran, { player: { id: 'ux-probe-0001', name: 'נמלה טסה 7', joined: true } });
  await page.evaluate(() => window.__game.start(12));
  await sleep(page, 800);
  await fight(page, 3, 400);
  await page.evaluate(() => {
    const g = window.__game;
    g.play.level.goals.length = 0;
  });
  await sleep(page, 900);
  await capture('33-replay-win', { wait: 600 });
  await click(page, '#replay-skip').catch(() => {});
  await capture('34-result-win', { wait: 900 });

  await page.evaluate(() => window.__game.prize({ kind: 'food', id: 'pizza' }));
  await capture('35-prize-food', { wait: 1400 });
  await page.evaluate(() => window.__game.prize({ kind: 'skin', id: 'rainbow' }));
  await capture('36-prize-skin', { wait: 1400 });

  // --- 5. Simultaneous notices: update banner + toast + coach at once -------------------------------------
  await load(page, url, veteran);
  await page.evaluate(() => window.__game.start(21));
  await sleep(page, 400);
  await page.evaluate(() => {
    window.__game.update();
    const t = document.getElementById('toast');
    t.textContent = 'הודעה ארוכה ארוכה ארוכה כדי לבדוק גלישה של טקסט בתוך הודעה';
    t.classList.remove('hidden');
  });
  await capture('40-notices-stacked', { wait: 500 });

  // The update offer waits for the menu.
  await page.evaluate(() => document.getElementById('pause-btn').click());
  await page.evaluate(() => document.getElementById('pause-quit').click());
  await page.evaluate(() => document.getElementById('toast').classList.add('hidden'));
  await capture('42-update-home', { wait: 600 });

  // --- 6. Daily challenge ---------------------------------------------------------------------------
  await load(page, url, veteran);
  await page.evaluate(() => window.__game.daily());
  await capture('41-daily-play', { wait: 1500 });
}
