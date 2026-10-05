# Night engine (implementation notes)

How, not what: guidance for the implementing agent, grounded in the current code of `apps/archipelago`.

## Why a new engine

`src/game/sim.ts` solves a static graph (one pass of routes, no clock, no concurrency, no shared state). The night needs time, parallel staff and a shared stock, so it gets its own pure module beside it (`src/game/night.ts`); `sim.ts` and the islands stay untouched.

## Model

- Integer ticks (one restaurant minute each); a night is 240 ticks, shown in about 60 to 90 seconds at x1, with pause and x2/x4.
- Seeded PRNG (no `Math.random`); arrivals from the seed plus the authored peak window; same seed and same cards give the same night (CAP-8).
- Entities: tables (clients), host (load balancer), waiters (API instances), stock board (database row per dish), ticket rail (queue), cooks (workers).
- The race is a read-modify-write gap: a waiter reads the board when promising and writes it a few ticks later. Two waiters reading inside the gap both see the same count. Lock turns read and write into one step with waiting; Check stock first moves the read but keeps the gap.
- Cards are timed inputs (`{card, at}`), so cards played mid-night replay exactly.
- Output: a per-tick state for rendering, an event log (ticket number, dish, waiter, times, status) for the dive and the alert, and a summary (revenue, wages and card costs, refunds, reputation change, average wait).

## One state, two views

The 3D restaurant and the blueprint lens both read the same per-tick state. The lens is an SVG overlay built with `glyphs.ts` symbols (database cylinder for the stock board, queue for the ticket rail, and so on); it never owns state.

## Reuse

`World` (renderer, camera, picking, quality tiers), `look.ts` materials, procedural `models.ts`, `glyphs.ts`, `progress.ts` (add fields with a migration in `parseProgress`), `audio.ts`, `i18n/strings.ts` (Hebrew, English terms), `firstTime` tips, `window.__game` hooks for Playwright.

## Tests that must exist

- No cards: overload during the peak, no race (CAP-2, CAP-9).
- Extra waiter: no overload, race fires at the last salmon (CAP-3, CAP-9).
- Extra waiter + Check stock first: race still fires.
- Extra waiter + Lock: no overload, no race.
- Same inputs twice give identical logs (CAP-8).
