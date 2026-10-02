# UX Behavior Report: Smash It!

Method: the `ux-behavior-report` skill (`.claude/skills/ux-behavior-report/`). The game was driven in Chrome with
`_bmad-output/planning-artifacts/smash-it/ux-scenario.mjs` at five viewports; every capture was screenshotted and
measured. Statements are **observed** unless marked *inferred* or *proposed*.

## Summary

Before the fixes the game was crowded in two places and fragile in three. Crowded: the phone HUD (time, score,
stars, goals, king HP, coach tip and combo stacked in the top third of a 360x640 screen), and the home screen
with the settings menu, update banner and toast all fighting for the same corners. Fragile: overlays did not own
the screen (the controls behind them were still reachable and the floating settings menu covered the Play button),
tall cards were centred so their top was cut off on short screens, and landscape phones (844x390) pushed controls
off the screen. The three biggest problems were (1) no single owner for layers and notices, (2) the top HUD
stack on phones, (3) cards that were designed for tall portrait screens only.

The fixes replace those with one layer manager, a one-row phone HUD, a modal settings card and landscape layouts.
The probe's overlap count dropped from 110-159 per viewport to 0-4 (see the before/after table), and the
remaining items are intentional (see "Not fixed / won't fix").

## Coverage

Driven (33 captures per viewport): first visit (home, menu, first game), veteran home, menu, privacy page,
chapters, shop (food, upgrades, skins), album, boards (both tabs), join form, intro, play, fighting (combos,
popups, tips), pause, king chapter, replay, result (lose and win), mop, prizes (food, skin), update banner + toast
+ coach at once, daily challenge.

Viewports: 390x844, 360x640, 844x390, 820x1180, 1280x800.

**Not covered**: real devices and notches (safe-area CSS was read, not measured), screen readers, the app's own
larger-text setting and 130% browser zoom, `prefers-reduced-motion`, offline mode, a pass with the keyboard only
(focus handling was added and checked in code and by the probe, not by a full manual tour), multi-touch gestures.

## Screen inventory (before the fixes, 390x844 unless noted)

| Screen | Controls | Text | Covered % | Primary action clear? | Issues |
| --- | --: | --: | --: | --- | --- |
| Home (first visit) | 2 | 7 | 17 | yes, one big button | none |
| Home (veteran) | 7 | 18 | 35 | yes | update banner sat on the card at 844x390 |
| Settings menu | 16 | 39 | 57 | n/a | floating panel covered Play; 16 overlaps; background still clickable |
| Chapters | 58 | 115 | 80 | n/a | densest screen; grid overflowed at 360 |
| Shop | 27 | 89 | 62 | buy button wrapped | price button wrapped to two lines at 360 |
| Play | 11 | 27 | 25 | the slingshot | HUD stack, combo vs coach, banner vs toast |
| Pause | 14 | 26 | 41 | resume is dominant | HUD controls reachable behind it |
| Result (win) | 4 | 21 | 33 | "next stage" dominant | star-note and stats misaligned; 2-column layout missing in landscape |
| Prize reveal | 1 | 6 | 17 | yes | clipped in landscape |

## Clutter and hierarchy

- **Play HUD (phone)**: five things competed for the top: time, score+stars, goal pills (each with a label),
  king HP, coach tip, and the combo pill stacked under the coach. Now: one row (pause, score, time), goal pills
  without the visible label (the label stays for screen readers), king HP as a single small pill, combo moved to
  the bottom above the tray where the thumbs are, the coach alone at the top.
- **Settings menu**: a floating column of 7 toggles + 3 links over the home screen. Now a card with a 2-column
  toggle grid, so it is half the height and has its own header and a close button. Links and reset are grouped.
- **Notices**: update banner, toast and coach could all be visible at once. The update offer now waits for the
  menu or home screen (never shown while playing) and sits at the bottom (top on short landscape screens).
- **Result**: goals and stats on the left, notes and buttons on the right in landscape; in portrait the star-note,
  shop hint and share are lower in the hierarchy (share is now a text link, not a third competing button).
- **Chapters**: the densest screen by design (a map of 40); kept, but tiles are fixed to five columns and a shorter
  height so a whole world fits on screen.

## Findings

### F1 Overlays do not own the screen (P0)
**Where**: every overlay (menu, chapters, shop, album, boards, pause) on all viewports.
**Observed**: the probe reported 7-10 controls reachable behind each overlay (covered = true under overlays), and
the floating settings menu covered the Play button (`02-menu-first`, `11-menu-veteran`).
**Reproduce**: open the menu on the home screen, then try to tap the Play button or open another overlay.
**Why it matters**: kids tap the wrong thing, double-open screens, lose focus.
**Root cause**: each overlay toggled its own `.hidden`; nothing disabled what was below; `menu` was a positioned
`<nav>` and not an overlay.
**Fix**: one layer manager in `main.ts` (`overlayStack`, `baseLayers`, `syncLayers`) that watches overlay class
changes, sets `inert` on everything except the top overlay, moves focus into the overlay and returns it to the
opener, and sets `aria-expanded` on the menu button; backdrop tap closes. Settings menu is now a real overlay.
**Effort**: MEDIUM  **Confidence**: HIGH
**Status**: Fixed.

### F2 Phone HUD stack (P1)
**Where**: play, 390x844 and 360x640.
**Observed**: coach tip, king HP, combo pill and goal pills stacked; `23-play-fighting` had popup/combo overlaps.
**Root cause**: `top-stack` held coach and combo, with fixed top offsets assuming a certain number of HUD rows
(`style.css` coach offsets).
**Fix**: single-row HUD at <=560px, hidden visual label for goals, combo moved out of `top-stack` and fixed above
the tray, magic-number offsets removed.
**Status**: Fixed (overlaps at 390x844 in `23-play-fighting`: 2 -> 0).

### F3 Tall cards were cut off on short screens (P1)
**Where**: all overlays at 360x640 and 844x390.
**Observed**: titles and close buttons off the top (13 elements out of screen at 844x390).
**Root cause**: `align-items: center` on a scrolling flex overlay clips the top of content taller than the screen.
**Fix**: `.overlay { display: flex }` + `.overlay > * { margin: auto }` (safe centring: scrolls from the top).
**Status**: Fixed (outside: 13 -> 0 at 844x390).

### F4 Landscape phone layouts (P1)
**Where**: home, result, prize reveal at 844x390.
**Fix**: `@media (orientation: landscape) and (max-height: 520px)` rules: tighter padding, home as a 2-column grid,
result as a 2-column grid, reveal with the art on the side and a scrolling text column.
**Status**: Fixed (overlaps at 844x390: 110 -> 4).

### F5 Update banner, toast and coach collide (P1)
**Observed**: `40-notices-stacked`, `42-update-home` before: banner over the toast over the coach; at 844x390 the
banner sat on the home card.
**Fix**: the update offer is queued until the menu/home (`updateWaiting`, `offerUpdate`), hidden when a game starts,
placed at the bottom (top on short landscape). Toast stays on `Notice` and auto-hides.
**Status**: Fixed.

### F6 Result card alignment (P2)
**Observed**: stats grid stretched across the card so labels and numbers were far apart; star-note off-centre.
**Fix**: `.stats` as a two-column `max-content` grid, centred; result card split into `.result-main` and
`.result-side`; share demoted to a link button.
**Status**: Fixed.

### F7 Chapters grid and shop buttons overflow on 360px (P1)
**Observed**: at 360x640 the chapter tiles at the right edge (1, 6, 11, 16, 21) and the world titles were clipped
(`ux2/360x640/13-chapters.png`); the shop's price button wrapped to two lines.
**Root cause**: `repeat(5, 1fr)` cannot shrink below a tile's min-content (the star row with letter-spacing);
the buy and choose buttons shared a row with `flex: 1 1 0`.
**Fix**: `repeat(5, minmax(0, 1fr))`, no letter-spacing, `padding-inline: 2px`; `.item-actions` wraps and the
buttons do not wrap their text.
**Status**: Fixed, verified in the browser at 360x640 and 390x844 (`grid.scrollWidth == clientWidth`).

### F8 Floating popups reach the screen edge and the pause card (P2)
**Observed**: a combo popup partly off-screen (390x844, `05-play-first-after-shots`); popups still floating over
the pause card.
**Fix**: popups are clamped to 70px from the edges (`popup()` in `main.ts`) and hidden while the game is paused.
**Status**: Fixed (not re-measured by the full probe; checked in code).

### F9 Menu note touching the links (P3)
**Fix**: 12px margin above `.menu-links`. **Status**: Fixed.

## What works

- First visit: one big button, the mission is told while playing.
- Tap targets: 0 elements under 44px and 0 crowded targets on every viewport, before and after.
- Text sizes: 0 items under 12px; contrast on the chrome meets AAA (the probe's remaining flags are decorative
  star glyphs and the gradient logo).
- Coach and `Notice` keep transient text short and auto-hiding. Daily challenge, album and boards are quiet.

## Fix plan (as done)

1. Layer manager + modal settings (F1). 2. Phone HUD and combo (F2). 3. Safe centring and landscape layouts
(F3, F4). 4. Notice ownership (F5). 5. Result alignment (F6). 6. Chapters/shop overflow, popups, menu spacing
(F7-F9).

## Re-test checklist

```bash
node .claude/skills/ux-behavior-report/scripts/probe.mjs --url http://localhost:5175 \
  --scenario _bmad-output/planning-artifacts/smash-it/ux-scenario.mjs --out "$SCRATCH/ux" --channel chrome
```

Then look at: `360x640` chapters, shop, play-fighting; `844x390` home, result, prize, pause, update banner;
`390x844` menu and result. Also try the keyboard: open the menu (focus goes in), Tab stays inside, Escape closes
and focus returns to the menu button.

## Before / after (probe totals over 33 captures per viewport)

| Viewport | Overlaps | Controls covered | Out of screen | Clipped | Small targets |
| --- | --: | --: | --: | --: | --: |
| 390x844 | 159 -> 4 | 89 -> 19 | 0 -> 0 | 2 -> 2 | 0 -> 0 |
| 360x640 | 157 -> 4 | 79 -> 9 | 0 -> 1 | 2 -> 2 | 0 -> 0 |
| 844x390 | 110 -> 4 | 75 -> 11 | 13 -> 0 | 2 -> 1 | 0 -> 0 |
| 820x1180 | 122 -> 0 | 74 -> 11 | 0 -> 1 | 2 -> 0 | 0 -> 0 |
| 1280x800 | 125 -> 2 | 74 -> 11 | 0 -> 2 | 2 -> 2 | 0 -> 0 |

"After" is the last full probe run (`ux3`); F7-F9 were applied after it and checked separately.

## Not fixed / won't fix

- **Covered "food" button in the tray**: the tray scrolls sideways, so one food is half out of view by design (the
  probe sees it under the canvas). Kept: the cut-off item tells the child there is more.
- **Clipped reveal layers (prize screen)**: the rays and confetti are decorative and cropped on purpose.
- **Star glyph overlap on the result**: the stars animate in; the overlap is mid-animation.
- **Pause card over the combo pill** (844x390): the pill is behind the dimmed card and inert.
- **Contrast flags on the logo and the earned-star glyphs**: decorative; the text next to them is AAA.
- Update banner at 844x390 touches the top padding of the home card (8px): kept, no content is covered.
