<!-- bmad:context -->
<!-- Verified 2026-09-23 against no commits yet (git not initialized). Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## WebstormProjects

Nx monorepo (npm, `nx@23.2.1`) hosting multiple separate, unrelated products — each its own app/lib, not one shared product. Per-product planning docs (briefs, PRDs, architecture) land under `_bmad-output/planning-artifacts/`; deeper project knowledge goes in `docs/`.

## Where things are

- Per-product planning artifacts: `_bmad-output/planning-artifacts/`
- Project knowledge / deeper docs: `docs/`

## Running and verifying

- Apps live in `apps/*` as npm workspaces; Nx infers targets from each app's `package.json` scripts.
- `mancala` (3D Kalah in the browser, Vite + three.js):
  - dev server: `npx nx run mancala:dev` (http://localhost:5173, also exposed on the LAN for phone testing)
  - tests: `npx nx run mancala:test` (vitest, rules engine)
  - typecheck + production build: `npx nx run mancala:build` (output `apps/mancala/dist`)
  - production server (static `dist/` + multiplayer WebSocket on one port, `PORT` default 8080): `npx nx run mancala:start` after build
  - online multiplayer: the server in `apps/mancala/server/` is authoritative (validates moves); in dev it runs inside the Vite server via a plugin, at `/ws`
  - UI text is translated (he, en, ar, ru, fr, es): add every new string to all dictionaries in `apps/mancala/src/i18n/strings.ts` (the `Dict` type enforces it); long pages live in `src/i18n/pages.ts`
  - magic mode (cards `block` / `mirror`) lives in the rules engine (`useCard` in `src/game/kalah.ts`); the server validates card plays like moves, and the AI decides card plays in `chooseCardPlay`
  - wall of fame: `apps/mancala/server/fame.ts` (`/api/fame`), in memory, saved through a `FameStore` (`server/fameStore.ts`): Turso when `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set (as on Render), otherwise a JSON file (`FAME_FILE`, default `apps/mancala/.data/fame.json`); the terms still say it may be reset at any time
  - accessibility target is WCAG AAA: keep text contrast ≥ 7:1 in both themes (use the CSS theme variables), controls ≥ 44px, everything keyboard-operable
  - board layout: sowing is clockwise with each player's store on their left; the rules engine is index-based (`src/game/kalah.ts`) and only `containerCenter` in `src/render/board3d.ts` decides placement
- `sukkah-world` (3D Sukkot world for kids, Vite + three.js PWA, single-player vs the computer for now):
  - dev server: `npx nx run sukkah-world:dev` (http://localhost:5174, also on the LAN)
  - tests: `npx nx run sukkah-world:test`; typecheck + build: `npx nx run sukkah-world:build`
  - developed in vertical slices; the plan and the product concept live in `_bmad-output/planning-artifacts/sukkah-world/`
  - game rules are pure and tested (`src/game/`: progress, economy, wearables, the Ushpizin quest chain in `progress.ts`, etrog hunt); save migrations live in `parseProgress`, so old saves keep working; `src/world/layout.ts` holds all positions and collisions; `src/world/` renders; `src/main.ts` wires UI to both
  - every model is procedural (`src/world/models.ts`), so there are no assets and the game works offline
  - the visual style (rim-lit toy materials, cartoon outlines, sky, wind, textures) lives in `src/world/look.ts`; bloom only catches emissive ≥ ~5 (bulbs, lanterns, sparkles), and `World` drops to low quality (no bloom, lower pixel ratio) on slow devices
  - deployed as a Render static site (`sukkah-world` in `render.yaml`), from `main` like mancala: work on the `sukkah-world` branch, merge to `main` to release
  - in dev, `window.__game` (world, progress, goTo/walkTo) lets Playwright drive the game; it is not in production builds
  - UI text is Hebrew only for now, in `src/i18n/strings.ts`; address kids in the plural and use infinitives on buttons
  - music (`src/audio.ts`, all synthesised): calm village tunes, and each quest gets its own faster theme while it is active (`Theme`, chosen in `updateMusic` in `main.ts`); quest-find sounds climb a major scale as the quest fills up (`lift`)
  - heat and battery: `World.setPace`/`due` cap drawing at 60 fps while moving and 30 when idle (120 Hz screens would otherwise double the work), pixel ratio is capped at 1.5, shadows redraw every other frame, and the menu has a battery saver
  - on touch screens the camera pad is hidden (two fingers turn and zoom); the accessibility menu can switch it back on
  - pop-up notices (toasts, hint, side-quest pill, install and update banners) go through `Notice` (`src/notice.ts`): they leave on their own after a few seconds and can be swiped away; never add one that stays on screen
  - `World.photoSukkah` renders the player's sukkah off-screen for the shareable greeting card (`sukkahCard` in `main.ts`)
- `smash-it` (3D slingshot game for kids: throw food at cartoon bugs, Vite + three.js PWA, single-player):
  - dev server: `npx nx run smash-it:dev` (http://localhost:5175, also on the LAN)
  - tests: `npx nx run smash-it:test`; typecheck + build: `npx nx run smash-it:build`
  - the concept and the slice plan live in `_bmad-output/planning-artifacts/smash-it/`
  - layers: `src/game/` is pure and tested (physics, foods, bugs, levels, `Session` for score/combo/goals, `Arena` for the field, replay staging, `progress.ts` for saves and the shop); `src/world/` renders whatever `Arena` it is bound to; `src/play.ts` is the slingshot input and the Impact Cam director; `src/finale.ts` is the replay and the mop (it pushes the mess off the screen); `src/main.ts` is the screen flow
  - a food's character is data in `FOODS` (`src/game/foods.ts`: launch angle and gravity = speed, `area`, `reload`, `after` = bounce / roll / rings / split)
  - 100 chapters in 10 worlds, generated (seeded) by `makeLevel` in `src/game/levels.ts` (each world has 5 stages, a theme and shape every 2 chapters, so it isn't always a round lawn; `dailyLevel` makes the daily challenge from the date): each world (`WORLDS`) has a theme, a size and its bugs; every 5th chapter is a king (`BossDef`: hearts, helpers, a bubble shield, armour); from `ROTATE_FROM` the slingshot walks around the world and fences guard crowds; tests check every chapter is winnable on paper
  - the play field is `field` in `src/game/physics.ts` (world radius, shape via `edgeFactor`/`edgeAt`, slingshot angle); use `onDisc`/`edgeAt`, never `hypot < radius`: `Arena` sets it for its level, so aim, guide and replay agree; use `slingAt()`/`aimAt()`, never fixed positions
  - the replay records shots, not frames: `stage` in `src/game/replay.ts` throws the same food again and walks each hit bug in a straight line to where it was hit, so keep flights deterministic (no randomness in `Arena` body motion)
  - save migrations live in `parseProgress`, so old saves keep working
  - ready-made models: Kenney's Food Kit (CC0, commercial use allowed) in `apps/smash-it/public/models/kenney-food/` for some foods (cookie, cheese, jelly, pie, pizza), the giant kitchen props and some rim decorations, loaded by `src/world/assets.ts` (precached, so offline still works; procedural stand-ins until loaded); only add models whose licence allows commercial use, and keep its licence file next to them
  - everything else (bugs, the other foods, worlds) and every sound is procedural: kawaii bugs (big sparkly eyes that blink, swirls when dizzy) in `src/world/bugs3d.ts`, foods with faces, worlds, obstacles, kitchen and mop in `src/world/models.ts`, world looks in `src/world/themes.ts`; bugs and foods are `THREE.LOD` models (detailed for close-ups, light in the normal view), and the world animates every detail level the same way
  - `src/audio.ts`: bugs talk through a small formant synthesiser (`Sound.voice(who, phrase)`: "ouch", "whee", "oh no", giggles; kings deep and slow; at most 3 at once); effects and marimba music go through a soft reverb
  - the look: physical toy materials (`mat` in `src/world/look.ts`: clearcoat, sheen, glass/jelly transmission, iridescence), instanced swaying grass, soft VSM shadows plus contact shadows under bugs and food, and `src/world/post.ts` (ambient occlusion, a tilt-shift blur that keeps the little world sharp, glow on bright highlights only, a colour grade); low quality skips post-processing and thins the grass
  - progression (`src/game/progress.ts`): foods are prizes for chapters (`FOOD_PRIZES`, shown off by `src/reveal.ts`), coins buy two upgrade tiers per food (`withTier` in `foods.ts`) plus guide and combo upgrades, total stars unlock slingshot colours (`SKINS`), and there's a bug album; the slingshot reloads almost at once, so several foods can fly at once
  - messages while playing have one channel (`Coach`, under the combo in `#top-stack`, below the HUD): events jump the queue and big banners hold it, so texts never overlap
  - performance on phones: `.claude/skills/browser-game-optimizer` (with `scripts/gpu-audit.mjs`, which counts draw calls, triangles, shadow casters and passes) is the tool for "too heavy / blank screen on a phone" problems; the budget is about 150 draw calls and 100k triangles per frame on the low tier (it was 1700 / 880k before the first pass)
  - rules that keep it light: static scenery is welded with `mergeStatic` (`src/world/optimize.ts`: one draw per material), so build models from the shared cached `mat()` materials; no `transmission` materials (use `transparent: 0.3`, real transmission re-renders the whole scene); kitchen and props never cast shadows; phones start in low quality (`initialQuality`: no post-processing and no composer buffers, PCF shadows 512, no outlines, thin grass, pixel ratio 1.25, no antialias) and `World.watchSpeed` lowers the quality and then the resolution (`resScale`) when frames are slow; a lost WebGL context reloads into low quality (`LOW_GFX_KEY`)
  - `.claude/skills/game-quality-critic` reviews how a game looks and feels like a games expert or top blogger (captures phone/landscape/desktop screenshots with `scripts/capture.mjs`); the Smash It review is `_bmad-output/planning-artifacts/smash-it/quality-review.md`
  - hits: `hitReach` / `splashReach` in `src/game/arena.ts` decide how close a food must be to hurt a bug (keep them tight, a generous hit area made the game too easy); pizza is procedural so its four slices are exactly its wedges (`pizzaPiece` in `models.ts`); bug detail depends on the quality tier (`setBugDetail`)
  - `.claude/skills/game-engagement-auditor` audits a game's engagement; the Smash It report is `_bmad-output/planning-artifacts/smash-it/engagement-audit.md`
  - teach while playing, never up front: tips go through `Coach` (`src/coach.ts`) and show once each (`firstTime` in `progress.ts`, remembered in `seen`) at the moment they matter (first hit on a bug kind shows what it's worth, first combo, a shot that fell short); the shop, upgrades, chapter list and food tray only appear once they are useful (`shopOpen`, `upgradesOpen`, `chaptersOpen`)
  - production server (static `dist/` + leaderboards API, `PORT` default 8080): `npx nx run smash-it:start` after build; in dev the API runs inside Vite (in memory)
  - leaderboards: `apps/smash-it/server/scores.ts` (`/api/scores`: all time by stars then chapter, and today's daily-challenge scores), on the honour system with sanity caps and a per-address limit, saved through a `ScoreStore` (`server/scoresStore.ts`): Turso when `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set (tables `smash_players`, `smash_daily`), otherwise a JSON file (`SCORES_FILE`, default `apps/smash-it/.data/scores.json`); joining is optional, players are a random browser id plus a nickname (`src/leaderboard.ts` suggests fun ones), and leaving deletes them from the server
  - Railway: its builder mounts a cache over `node_modules/.vite`, so a build command must not run `npm ci` (it fails with EBUSY; `render.yaml`, which Railway imports, uses `npm install` for that reason); Node 24 comes from `.node-version`; set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in the service variables; Config as Code is deprecated on Railway, so build settings live in the service's dashboard
  - deployed as a Render web service (`smash-it` in `render.yaml`), from `main`: work on the `smash-it` branch, merge to `main` to release
  - in dev, `window.__game` (start, shootAt, coins, play, progress) lets Playwright drive the game; it is not in production builds
  - UI text is Hebrew only for now, in `src/i18n/strings.ts`; address kids in the plural and use infinitives on buttons; wrap `×n` in LRI/PDI marks inside Hebrew strings

## Conventions that differ from defaults

- Every project added here is TypeScript, using npm as the package manager — don't introduce another language or package manager without updating this file.
- Projects are independent products with separate users and roadmaps — don't assume shared code, dependencies, or release cadence between them unless a shared lib is deliberately created.

<!-- /bmad:context -->
