---
name: ux-behavior-report
description: Audit the user interface of a running app or game by actually driving it in a browser at several screen sizes and states, and produce a UX Behavior Report. Finds clutter and weak hierarchy, overlapping or clipped elements, things that break (stuck states, dead ends, broken layouts, leftovers after a screen closes, input during transitions), small touch targets, contrast problems and keyboard or screen-reader gaps. Every finding comes with measured evidence, a root cause in the code and a concrete fix. Use when the UI feels crowded, breaks on some screens or phones, or before a release.
---

# UX Behavior Report

## Purpose

You are a senior UX engineer. You judge an interface by **how it behaves when real people use it**, not by how
the code or the design file says it should look. Read the code to find *why*, but trust the browser to tell you
*what*.

The report answers two questions:

1. **Is it crowded?** Can a person tell within a second what matters on this screen and what to do next?
2. **Does it hold together?** Do elements stay readable, inside the screen, out of each other's way and
   reachable, in every state, on every screen size, and does every flow end somewhere sensible?

Do not change code while auditing. Implement fixes only when the user asks (they usually do, right after the
report: then fix by priority and re-measure).

---

# 1. Process

## 1.1 Inventory (read first)

Before opening a browser, list from the code:

- **Screens and overlays**: every top-level view and how it is shown or hidden (`.hidden` toggles, routes,
  dialogs). Note the z-index of each layer.
- **Transient UI**: toasts, banners, hints, coach bubbles, pop-ups, floating numbers, tooltips. Which can be on
  screen **at the same time**? Which positions do they use?
- **Persistent HUD**: what is on screen all the time during the main activity, and how much room does it take?
- **Flows**: first run, a normal session, an error/offline case, an interrupted flow (pause, back, rotate,
  resize, tab hidden), and the end of every flow (where does the user land?).
- **Text sources**: dictionaries, the longest string of each kind, and whether strings are built from numbers
  or names (those are what overflow).

Write the inventory as a table (screen, how to reach it, what is on it). You will use it as a checklist, so each
row must end up measured, not assumed.

## 1.2 Drive the real app

Run the app (dev server) and drive it with Playwright. Use `scripts/probe.mjs` from this skill, which loads a
"scenario" module that moves the app through its states and calls `capture(name)` in each; the probe then
screenshots and measures every capture at every viewport.

```bash
node .claude/skills/ux-behavior-report/scripts/probe.mjs \
  --url http://localhost:5173 \
  --scenario path/to/scenario.mjs \
  --out "$SCRATCH/ux" \
  --viewports 390x844,360x640,844x390,820x1180,1280x800
```

Browser: Playwright's `chromium`; if the bundled one is not installed use `--channel chrome`. Never run
`playwright install` in a locked-down environment; use whatever browser is already there.

A scenario is plain JavaScript:

```js
export default async function (page, capture) {
  await page.goto(process.env.URL);
  await capture('home');
  await page.click('#home-play');
  await capture('intro');
}
```

Write the scenario so that it also **stresses** the app (section 3), not only walks the happy path.

**Always look at the screenshots** (open them with the Read tool). Numbers find problems; only your eyes judge
whether a screen feels crowded or ugly. A report written without viewing the screenshots is not acceptable.

## 1.3 Viewports and conditions

Cover at least:

| Case | Why |
| --- | --- |
| Phone portrait 390x844 and a small one, 360x640 | the primary device for most consumer apps |
| Phone landscape 844x390 | the shortest height; HUDs and dialogs break here first |
| Tablet 820x1180 | stretched layouts, tiny content in a big frame |
| Desktop 1280x800 | the first impression, and the reviewer's screen |
| Touch emulation (`hasTouch`) and keyboard only | different failure modes |
| Larger text (the app's own setting or 130% browser zoom) | text that grows out of its box |
| `prefers-reduced-motion: reduce` | motion that is required to understand the UI |
| Right-to-left (if the app is RTL) | mirrored layouts, arrows, punctuation, numbers |
| The **longest** real strings and the largest numbers | overflow and wrapping |
| A slow or offline network | spinners that never end, buttons that do nothing |

Say which of these you did **not** cover.

---

# 2. What to measure (the probe does these; you interpret)

For each capture and viewport the probe reports:

- **Overlap**: pairs of visible text blocks / controls whose boxes overlap (ancestor and descendant pairs are
  ignored). Text on text is almost always a bug; a control under a control is a bug (the user cannot tell what a
  tap will hit).
- **Out of screen**: visible elements partly outside the viewport (including under notches, which the probe
  cannot see: check `env(safe-area-inset-*)` in the CSS yourself).
- **Clipped text**: elements whose content is wider/taller than the box that hides the excess.
- **Tap targets**: interactive elements smaller than 44x44 CSS px (the app may set a stricter target; follow
  the project's own rule in `AGENTS.md`/`CLAUDE.md`), and targets closer than 8px to another target.
- **Contrast**: text against its effective flat background (WCAG ratio; the project may target AAA = 7:1). The
  probe skips text over gradients and images; check those by eye.
- **Small text**: anything under 12px.
- **Density**: how many controls and text blocks are visible at once, and the share of the screen they cover.
  Use it to compare screens, not as a pass/fail number.
- **Console errors and failed requests** during the scenario.

False positives are normal (a decorative overlap, a hidden but measured element). **Verify each finding in the
screenshot before it enters the report**, and drop the ones that are not real.

---

# 3. Behavior checks (what breaks when people are people)

Go through these on every flow in the inventory. Each is a question you answer by *doing* it.

## State and flow

- **Dead ends**: can the user always go back, close or continue? Does every dialog have a visible way out *and*
  respond to Escape / the platform back gesture?
- **Stuck states**: what if a step never completes (a network call fails, an animation is skipped, an asset is
  late)? Is there a timeout or a skip?
- **Leftovers**: after closing a screen, are its timers, sounds, pop-ups, focus trap, scroll lock or highlight
  still around? Open the same screen again: is it fresh or does it show the previous state?
- **Re-entry**: do the same thing twice in a row, and do it from every entry point (a screen reachable from two
  places often only works from one).
- **Interruption**: pause, switch tab, rotate, resize, lock the screen, receive a notification in the middle of
  a flow. Does it resume correctly?
- **Input during transitions**: tap twice quickly, tap while a screen animates in or out, tap two different
  buttons almost together. Does anything double-fire, skip a step or land on the wrong screen?

## Overload and hierarchy

- **Simultaneity**: trigger every transient element at once (toast + banner + hint + pop-ups + HUD change).
  Which ones collide? Is there a single owner that queues or drops the less important ones?
- **One primary action** per screen, visually dominant, in a predictable place. Count competing "loud"
  elements (large, saturated, animated, or high contrast).
- **Progressive disclosure**: is everything shown now needed now? What can wait until it is relevant, move
  behind a tap, or become a sound/animation instead of text?
- **Redundancy**: the same information in two places (a score in the HUD and in a pop-up and in a toast) is
  clutter; keep the one in the right place.
- **Reading load for the audience**: for children and quick-play games, one idea per message and about 6 words
  where possible; text that appears mid-action must be readable in 1 second or not shown.
- **Layering**: when several overlays or pop-ups can stack, is the order intentional, and does the layer
  underneath stop receiving input? (The probe skips controls inside `[inert]` when it looks for covered
  controls, because a layer switched off behind a modal is the intended fix; a covered control that is **not**
  inert is still a bug.)

## Layout robustness

- Content that depends on viewport height (HUD + tray + dialog) at 360x640 and 844x390.
- Dialogs taller than the screen: do they scroll, and is the primary button still reachable?
- Long names, large numbers, the longest translation.
- Fixed/absolute positioning with magic numbers that assume another element's size.
- Safe areas (notches, home indicator), browser UI bars that change the viewport height (`100vh` vs `100dvh`).
- Hover-only information, and gestures with no visible alternative (swipe-only, long-press only).

## Accessibility behavior

- Complete tour with the **keyboard only**: is the focus ring visible, is the order logical, is focus moved
  into a dialog when it opens and returned when it closes, does Tab escape a modal?
- **Screen reader** names: every control has an accessible name; state is exposed (`aria-pressed`,
  `aria-selected`, `aria-expanded`); changes of state that matter are announced once, not spammed.
- **Motion**: is anything essential conveyed only by motion? Does reduced motion actually reduce it?
- **Colour**: is anything conveyed only by colour?
- **Time pressure**: do messages that matter disappear before they can be read?

---

# 4. Severity

| Level | Meaning |
| --- | --- |
| **P0 Broken** | The user cannot proceed or cannot read/hit something essential: stuck state, dead end, control off-screen or covered, text unreadable, crash. |
| **P1 Hurts** | Works, but it visibly looks broken or confusing: text overlapping text, clipped labels, targets too small to hit reliably, wrong hierarchy on a main screen. |
| **P2 Rough** | Clutter and polish: too much at once, redundant info, inconsistent spacing, weak contrast on secondary text. |
| **P3 Idea** | Optional improvements and experiments. |

Rank by **how many people on how many screens it affects x how bad it is**, not by how interesting the fix is.

---

# 5. Finding format

```markdown
### [ID] Short title (P0/P1/P2/P3)

**Where**: screen / state / viewport(s)
**Observed**: what happens (measurements: sizes, overlap %, ratio) and the screenshot file.
**Reproduce**: exact steps (so the fix can be re-tested).
**Why it matters**: who is affected and what they lose.
**Root cause**: file:line and the mechanism (not just the symptom).
**Fix**: the concrete change.
**Effort**: LOW / MEDIUM / HIGH   **Confidence**: LOW / MEDIUM / HIGH
```

Mark each statement as **observed** (you saw/measured it), **inferred** (reasoned from code) or **proposed**.
Do not report an inferred problem as observed.

---

# 6. Report structure

Write to `_bmad-output/planning-artifacts/<product>/ux-behavior-report.md` (or where the user says):

```markdown
# UX Behavior Report: <product>

## Summary
(3 to 6 sentences: how crowded, how robust, the top 3 problems.)

## Coverage
Screens/states driven, viewports, conditions, what was NOT covered.

## Screen inventory
Table: screen | density (controls, text blocks, % covered) | primary action clear? | issues.

## Clutter and hierarchy
Per screen: what competes, what to remove, merge, delay or turn into a sound/animation.

## Findings
P0, P1, P2, P3 in the format above.

## What works
Keep these; do not "fix" them while fixing the rest.

## Fix plan
Ordered list, grouped so that one change fixes several findings.

## Re-test checklist
Exact scenarios to repeat after the fixes (the scenario file path).
```

---

# 7. After the fixes (when the user asks you to implement)

1. Fix in priority order; prefer **one structural change that removes a whole class** of findings (a single
   owner for transient messages, a shared layout rule) over many local patches.
2. Prefer **removing** UI over rearranging it. Every element you delete is one that cannot overlap.
3. Add a unit or scenario check for each bug that can be tested without a browser.
4. Re-run the same scenario and probe. Put a **before/after table** (counts of overlaps, small targets, clipped
   items per screen and viewport) at the end of the report and mark each finding Fixed / Not fixed / Won't fix
   (with why).
5. Look at the new screenshots. A fix that removes the measurement but looks worse is not a fix.
6. Run the project's tests and build.

---

# 8. Guardrails

- Evidence over opinion: no finding without a measurement, a screenshot or a reproducible step.
- Do not recommend dark patterns, forced engagement or misleading controls.
- Respect the project's own rules (accessibility target, copy voice, language, component conventions). Fixes
  must not break them: new text goes through the project's i18n; colours go through its theme variables.
- Do not redesign what is not broken. The audit is about clarity and robustness, not a new look.
- Be explicit about uncertainty and about what you could not test (real devices, screen readers, notches).
