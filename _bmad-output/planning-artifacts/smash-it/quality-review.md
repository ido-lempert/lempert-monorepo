# Smash It: quality review

Written with the `game-quality-critic` skill (`.claude/skills/game-quality-critic`), after a few kids who played the game called the graphics bad. The critic played chapters 1, 12 and a king chapter at phone-portrait, phone-landscape and desktop sizes (`scripts/capture.mjs`), compared them with the genre's best (Angry Birds, Fruit Ninja, Cut the Rope) and listed what a kid sees first.

## What the kids see (findings, worst first)

| # | Finding | Why it reads as "bad graphics" | Fix |
|---|---------|-------------------------------|-----|
| 1 | In landscape the lawn was a small island in a huge empty counter | The hero of the screen was about a third of it; the rest was floor-like orange bands | Tighter landscape camera (`homeCamera` in `world.ts`), hint moved to the corner |
| 2 | The table looked like a banded orange floor | No sense of a kitchen counter, no detail | Light oak planks with staggered joints and soft grain (`woodTexture` in `look.ts`) |
| 3 | Grass was noisy with dark specks | Blade shading ranged too dark at the roots | Blade shade range `0.85..1.12` instead of `0.55..1.15` |
| 4 | Bugs fell back to the light model and lost their outline at the normal play distance | The stars of the game looked flat and cheap | Bugs keep full detail and a cartoon outline at play distance on good devices; phones keep the light model but outlines stay on the detailed one (`setBugDetail`) |
| 5 | The slingshot was thin and low-contrast against the table | The thing you touch the whole game was hard to read | Thick red frame, yellow tape, blue bands and an outline that stays on even in low quality |
| 6 | The pizza broke into pieces that did not look like wedges | The crust sat on the wrong quadrant, and slices were drawn at a third of the size of the whole pizza | Procedural pizza whose four wedges are exactly the pieces it splits into; slices drawn at the pizza's size and thrown side by side |

## Gameplay note (not graphics)

The hit area was larger than the bugs (`radius + bug * 1.1` for a hit, `area + radius` for a splash), which made the game too easy. It is now `food * 0.8 + bug * 0.9` for a direct hit and `area * 0.6 + bug * 0.8` for a splash (`hitReach` / `splashReach` in `src/game/arena.ts`), and the roll-over and the aim guide use the same numbers. Chapters are still winnable on paper (tests). Watch chapters 1-10 in play: if kids now fail the early ones, soften those.

## Performance check

`gpu-audit.mjs` on the low tier: the same draw calls and triangles as before this pass (about 220-300 calls and 120-170k triangles in the audit's battery-saver setup, which is looser than a real phone start). The first version of this pass kept every bug detailed everywhere and doubled the load; bug detail is now tied to the quality tier.

## Still open (next pass)

- Boss and intro banners still cover the lawn in landscape.
- The slingshot is still small in landscape.
- The wall and props behind the counter look soft; the orange bloom at the upper right is distracting.
- The low tier could use a little more life (a light outline on the light bug model).
