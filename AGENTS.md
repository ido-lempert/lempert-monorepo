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
  - wall of fame: `apps/mancala/server/fame.ts` (`/api/fame`), in memory + JSON file (`FAME_FILE`, default `apps/mancala/.data/fame.json`) – may be wiped on redeploy, which the terms state
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
  - `World.photoSukkah` renders the player's sukkah off-screen for the shareable greeting card (`sukkahCard` in `main.ts`)

## Conventions that differ from defaults

- Every project added here is TypeScript, using npm as the package manager — don't introduce another language or package manager without updating this file.
- Projects are independent products with separate users and roadmaps — don't assume shared code, dependencies, or release cadence between them unless a shared lib is deliberately created.

<!-- /bmad:context -->
