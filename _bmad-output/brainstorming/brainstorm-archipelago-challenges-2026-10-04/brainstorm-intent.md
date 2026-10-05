# Archipelago: challenge-based direction (brainstorm intent)

Source: brainstorming session 2026-10-04 (partner mode, complete). "Decided" = user decision; "Proposal" = coach idea, not yet adopted unless a decision says so.

## 1. Intent

The current Archipelago mechanic (place pieces, draw pipes, watch requests flow) is boring. The new direction is challenge-based play for teens and adults: the player faces real problems (load spikes, race conditions, designing a product) and arrives at the industry-known solutions (design patterns) while appreciating the beauty of design. The existing simulation and 3D world are reused where possible.

## 2. Core concept

- Decided: the central metaphor is a restaurant as the system (chosen over an escape room, which was easier technically but less intuitive). Orders are requests, cooks are servers.
- Decided: the player is the owner, a judge in a reality show, looking top-down like a board game and able to dive into zones (order tickets, dishes sent out) = architecture map plus communication mapping plus logs.
- Proposal (Kitchen Nightmares format): each night is an episode. Watch a failing service, investigate, prescribe a fix, get a verdict card naming the pattern.
- Chosen through-line (the loop per night): see, investigate, decide, then learn the name.
- Example mappings (proposal): race condition = last salmon sold twice (lock); load balancer = host; cache = mise en place; queue = ticket rail; circuit breaker = 86 the dish; pub/sub = kitchen display; saga = refund after a burnt dish.

## 3. Key mechanics

- Decided: fixing = choose a card and place it where relevant (position only matters when relevant). Moving people or equipment around is rejected.
- Decided: card cost is three-way: service time, reputation, money (FinOps). Proposal: cards carry trade-offs and wrong cards are plausible, so it is a design decision, not a quiz; some cards need placement (where the lock goes), some are global (hire a cook).
- Decided (user idea, adopted into scope): zoom/dive with order numbers on tickets; proposal that this is the trace ID for following one order across stations, and zoom levels mirror C4 (context, containers, components, code/logs).
- Decided: blueprint lens at the top level shows the same world as a technical diagram, so players who already understand can read the problem there. Proposal framing: a lens, not a switch; same data, same cards; a Rosetta stone (pros solve from the diagram, learners translate from the restaurant).
- Decided: both peak types, predictable peak first (capacity planning), then surprise peaks (alerting, auto-scaling, graceful degradation such as shortening the menu = load shedding). Proposal: peaks also expose hidden bugs invisible at low load.
- User idea: couriers, 10 on duty = max service but expensive, vs on standby = cheap but slow to summon (cloud scaling cost vs arrival time). Proposal: tiers map to cloud pricing: payroll = reserved, standby = auto-scaling with cold-start delay, freelancers = spot instances that may vanish mid-rush.
- User insight: the race condition only bites when the item is the last one (stock = 1). The kitchen then raises an alert: an order came in but no matching raw materials exist (error signal for the owner).
- User idea: industry-standard technical symbols on staff shirts and elements.
- Proposal: reputation is a slow variable (SLA/SLO, error budget); end of night shows a P&L plus reputation statement.
- No runtime AI (decided: too expensive to support now). AI-suggestion cards, if kept, are hand-authored scripted cards labelled as AI suggestions.

## 4. First-version scope (MoSCoW, as logged)

- Must: top-down restaurant on the existing sim/world; one predictable peak; last-fish race condition with kitchen alert; one dive into order tickets with order number; three cards with time/reputation/money cost; verdict card with pattern name (he + en); replay the night; read-only blueprint lens (user confirmed it stays Must).
- Should: shirt symbols; card preview; standby couriers with delay; reputation across nights; investigation time.
- Could: surprise peak; live SimCity mode; scripted AI-suggestion cards; final exam without the restaurant skin.
- Won't: runtime AI; team mode and org reports; full four C4 levels; other islands.

## 5. Audience, positioning, value

- Audience: teens and adults (region and background still to be defined).
- Positioning (user insight): developers increasingly generate code with AI, so theoretical architecture knowledge (reading, judging, directing designs) matters more than ever. This is a reason for organizations to adopt the game for training.
- The restaurant plus read-only blueprint lens serves teens, adults and org training from one dataset.
- UI text stays Hebrew, with technical terms in English, as in the existing game.

## 6. Open questions and risk

- Living SimCity-style world (always in motion, advisors) vs a sequence of nights with a verdict each?
- What does the player do in a quiet minute while nothing is broken?
- How is learning transfer to real software measured (post-game blueprint challenge, hidden pure-diagram mode)? Does the player ever design from a blank board, or only repair?
- Audience: ages, background, region.
- What drives long-term return (craft mastery, a growing restaurant with regulars, daily challenge, competing with colleagues)?
- How to teach card meaning while playing (card preview / ghost simulation, hidden pattern name revealed as a reward, cheap failure).
- Technical risk: the current simulation has requests on a graph but no shared mutable state (stock) and no time-based peaks, both of which the race condition and peaks require.

## 7. First-version success test

- A stranger with no architecture background, after ten minutes, explains aloud why the last fish was sold twice and names the fix.
- A senior developer shown the blueprint lens recognises the problem in under a minute and wants to keep playing.
- Players replay a night to try a different card without being asked to.
