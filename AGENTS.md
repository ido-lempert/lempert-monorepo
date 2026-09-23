<!-- bmad:context -->
<!-- Verified 2026-09-23 against no commits yet (git not initialized). Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## WebstormProjects

Nx monorepo (npm, `nx@23.2.1`) hosting multiple separate, unrelated products — each its own app/lib, not one shared product. Per-product planning docs (briefs, PRDs, architecture) land under `_bmad-output/planning-artifacts/`; deeper project knowledge goes in `docs/`.

## Where things are

- Per-product planning artifacts: `_bmad-output/planning-artifacts/`
- Project knowledge / deeper docs: `docs/`

## Running and verifying

- TODO: no apps/libs exist yet and `package.json` has no `scripts`. Once the first project is scaffolded (TypeScript, npm), fill in the real build/test/lint commands here and verify them — don't guess.

## Conventions that differ from defaults

- Every project added here is TypeScript, using npm as the package manager — don't introduce another language or package manager without updating this file.
- Projects are independent products with separate users and roadmaps — don't assume shared code, dependencies, or release cadence between them unless a shared lib is deliberately created.

<!-- /bmad:context -->
