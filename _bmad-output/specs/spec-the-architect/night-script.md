# Night script (v1)

One authored night, fixed seed. Calls made under the user's delegation, pending their review.

## Business scenario

A small fish restaurant, open 18:00 to 22:00. A tour bus has booked for 20:00 (the announced peak). Salmon is the house dish and limited: the last one goes during the peak. One waiter, two cooks, one host at the door, a stock board on the kitchen wall.

## Beats

| Time | What happens | Without cards | With Extra waiter | With Extra waiter + Check stock first | With Extra waiter + Lock |
|---|---|---|---|---|---|
| 18:00 to 19:30 | Calm: a few tables | Fine | Fine (waiter partly idle, costs money) | Fine | Fine |
| 20:00 to 20:45 | Peak: the bus | One waiter can't keep up: tables wait, some leave, reputation drops | Peak handled | Peak handled | Peak handled, orders slightly slower when both need the board |
| About 20:20 | Two tables want salmon, one is left | No race (one waiter is serial) | Both waiters read "1", both promise it; the second ticket reaches the kitchen with no salmon: kitchen alert, refund, angry table | Same race, the check happens inside the gap | The second waiter waits for the marker, reads "0", offers another dish: no alert |
| 22:00 | Night summary | Loss in reputation and tables | Profit, but alert, refund and reputation hit | Same as left, verdict names the anti-pattern | Best night: profit, reputation up |

## Teaching sequence (no up-front instructions)

1. First night starts from one Play button; the peak is announced on screen before 20:00 with a suggestion to look at the cards.
2. The overloaded night ends; the Extra waiter card is the first one offered.
3. Second night: the kitchen alert fires; a one-time tip invites the player to dive into the kitchen (CAP-4) and follow the salmon order numbers.
4. The two new cards appear; Check stock first is tried by most players, fails, and earns the anti-pattern verdict.
5. Lock wins the night and the verdict names Race condition and Lock.

The blueprint lens (CAP-5) is available from the first night; a one-time tip mentions it after the first verdict.
