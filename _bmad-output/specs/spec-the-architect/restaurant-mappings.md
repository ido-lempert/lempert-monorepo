# Restaurant mappings

Reference for naming and designing elements. Proposals from the brainstorm, not yet decisions, unless marked Decided.

## Concept mapping

| Restaurant | Architecture | Status |
|---|---|---|
| Order ticket | Request | Decided |
| Cook | Server (worker behind the ticket rail) | Decided |
| Waiter | API instance taking requests; two waiters = horizontal scaling | Coach call, pending review |
| Stock board on the kitchen wall | Database row per dish | Coach call, pending review |
| Order number on a ticket | Trace ID (follow one order across stations) | Decided (numbers on tickets) |
| Last salmon promised twice by two waiters; fix: one marker for the stock board (see `cards.md`) | Race condition; Lock | Decided (race scenario); fix is a v1 card, pending review |
| Host seating guests across areas | Load balancer | Proposal |
| Prepared sauces (mise en place) | Cache | Proposal |
| Ticket rail at the kitchen window | Queue | Proposal |
| "86 the dish" (stop taking orders for a failed station) | Circuit breaker | Proposal |
| Kitchen display showing one order at every station | Pub/Sub | Proposal |
| Refund after a burnt dish that was already paid | Saga | Proposal |
| Shorten the menu during a rush | Load shedding / graceful degradation | Proposal |
| Kitchen alert: order in, no matching ingredient | Error signal for the owner | Decided |

## Couriers and cost (FinOps)

| Couriers | Cloud equivalent | Behaviour |
|---|---|---|
| 10 on payroll | Reserved capacity | Max service at peak, paid even when quiet. Decided as the "10 on duty" idea. |
| On standby | Auto-scaling with cold start | Cheap, but takes time to arrive. Decided as the standby idea. |
| Freelancers | Spot instances | Cheapest, may vanish mid-rush. Proposal. |

Reputation is a slow variable (SLA/SLO, error budget): a bad night dents it, several good nights rebuild it. Proposal.

## Zoom levels (C4)

Context (restaurant and its world), containers (zones: kitchen, bar, till, storeroom), components (stations and people with industry symbols on shirts), code/logs (tickets and dishes sent). v1 has the top view plus one dive; the full four levels are a non-goal.

## Night format

Each night is an episode: watch the failing service (can pause and rewind to investigate), investigate, decide with cards, run the night again, then the verdict card. The loop is: see, investigate, decide, learn the name. Proposal, adopted as the chosen through-line.

## Symbols

Industry-standard symbols appear on staff shirts and elements (Archipelago's `apps/archipelago/src/glyphs.ts` is the starting point to copy).
