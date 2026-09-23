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
  - board layout: sowing is clockwise with each player's store on their left; the rules engine is index-based (`src/game/kalah.ts`) and only `containerCenter` in `src/render/board3d.ts` decides placement

## Conventions that differ from defaults

- Every project added here is TypeScript, using npm as the package manager — don't introduce another language or package manager without updating this file.
- Projects are independent products with separate users and roadmaps — don't assume shared code, dependencies, or release cadence between them unless a shared lib is deliberately created.

<!-- /bmad:context -->
