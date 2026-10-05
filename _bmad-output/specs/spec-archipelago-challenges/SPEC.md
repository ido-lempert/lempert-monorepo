---
id: SPEC-archipelago-challenges
companions:
  - cards.md
  - night-script.md
  - engine.md
  - restaurant-mappings.md
  - scope-tiers.md
sources:
  - ../../brainstorming/brainstorm-archipelago-challenges-2026-10-04/brainstorm-intent.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Archipelago: the restaurant challenge (first version)

## Why

A vision to realize and a pain to solve. Archipelago (`apps/archipelago`, a 3D game teaching software architecture to teens and adults) is boring: placing pieces, drawing pipes and pressing run lets the player build a correct system without ever feeling a problem. The new direction is challenge-based play: the player first experiences real failures (load spikes, race conditions) and then arrives at the industry-known solutions (design patterns and others), appreciating the beauty of the design. The same game must also be credible as training for development teams, where understanding architecture matters more as AI writes more of the code.

## Capabilities

- **CAP-1**
  - **intent:** The owner watches a restaurant night as an episode from a top-down, board-game view, on the existing archipelago simulation and 3D world.
  - **success:** A night runs start to finish on the board and ends with a profit-and-loss and reputation summary.

- **CAP-2**
  - **intent:** A night contains one predictable peak, announced before it starts, so the player can prepare capacity with cards.
  - **success:** The peak is visible to the player before the night begins; an unprepared restaurant shows measurably longer service times during it; a prepared one does not.

- **CAP-3**
  - **intent:** The race condition appears as the last item in stock being promised to two orders, and the player is alerted by the kitchen: an order arrived but no matching ingredient exists.
  - **success:** A deterministic test: with stock of one and two concurrent orders for the item, the alert fires and a customer becomes unhappy; with stock of two, or with the fixing card in play, neither happens.

- **CAP-4**
  - **intent:** The player can dive from the top view into a zone to read order tickets and dishes sent out, and can follow one order number across stations.
  - **success:** From the alert, the player opens the zone, selects the double-promised order's number and sees both stations that took it.

- **CAP-5**
  - **intent:** A read-only lens shows the same world as a technical blueprint diagram, using industry-standard symbols, so players who already know architecture can read the problem there.
  - **success:** Toggling the lens changes no game state; every restaurant element and every call between them appears in the diagram; a senior developer shown the lens on the failing night names the problem in under a minute.

- **CAP-6**
  - **intent:** The player fixes a problem only by choosing a card and placing it where position matters (global cards need no placement); each card costs service time, reputation and money.
  - **success:** The three cards in `cards.md` are playable before the night and while paused mid-night; playing each changes the night's outcome and displays its three costs; the plausible-but-wrong card (Check stock first) visibly fails to stop the race; no card or control moves people or equipment.

- **CAP-7**
  - **intent:** After a night, a verdict card names the professional pattern behind the fix, in Hebrew and English.
  - **success:** After a night fixed with the lock card, the card names the pattern (Lock); after a night fixed another way, it names that way's pattern.

- **CAP-8**
  - **intent:** The player can replay the same night with a different card.
  - **success:** The same cards give the same outcome on every replay; a different card gives a different, explainable outcome.

- **CAP-9**
  - **intent:** Fixing the peak creates the next problem: the extra concurrency of a scaled-up floor (a second waiter) exposes the last-fish race that the slower night hid.
  - **success:** A deterministic test: the authored night with no cards has no race; the same night with Extra waiter has the race; with Extra waiter and Lock it has neither the overload nor the race.

## Constraints

- No dependency on AI at runtime; all content is authored or scripted in advance.
- No up-front instructions: a card's meaning is learned while playing.
- UI text is Hebrew with technical terms in English; game rules stay pure and unit-tested, as elsewhere in the app.
- The restaurant skin and the blueprint lens render one shared game state, so nothing is solvable in one view only.
- A card's cost is always three-way (service time, reputation, money); money is never the only price.
- The problem only bites at its exact condition (the last item in stock); cases that look identical at low load must be fine, so nothing is "always broken".

## Non-goals

- AI-powered features at runtime.
- Team mode and organisation reports or dashboards.
- All four C4 zoom levels; v1 has the top view and one dive level.
- Other islands (DDD, microservices) and other patterns beyond what v1's cards need.
- Moving people or equipment on the board.
- Surprise peaks, a live SimCity-style world and other items listed as Should or Could in `scope-tiers.md`.

## Success signal

A stranger with no architecture background, after ten minutes, explains aloud why the last fish was sold twice and names the fix. A senior developer shown the blueprint lens recognises the problem in under a minute and wants to keep playing. Players replay a night to try a different card without being asked to.

## Assumptions

- The current simulation (`src/game/sim.ts`) is a static path solver with no clock, concurrency or shared stock; the night runs on a new pure, seeded, time-stepped engine (`engine.md`).
- v1 is one authored night with a fixed seed, played as short replayable nights (about 60 to 90 seconds, pause and x1/x2/x4 speed).
- Audience v1: Hebrew speakers aged about 14 and up, in Israel.

Calls made under the user's delegation, pending their review:

- The three v1 cards are Extra waiter, Check stock first (wrong) and Lock (`cards.md`).
- The night chain: the peak is fixed by scaling, which exposes the race (`night-script.md`).
- The restaurant ships as a new entry beside the existing islands; nothing is removed before playtest feedback.
- Cards can also be played while paused mid-night, so the owner is not a passive viewer.
- A card shows its restaurant action and costs; its professional name is first shown on the verdict card, then on the card.

## Open Questions

- How is learning transfer to real software measured beyond the v1 playtest (post-game blueprint challenge, hidden pure-diagram mode)? Does the player ever design from a blank board?
- What drives long-term return: craft mastery, a growing restaurant with regulars, a daily challenge, or competing with colleagues?
- Audience background and regions beyond Hebrew-speaking teens and adults.
