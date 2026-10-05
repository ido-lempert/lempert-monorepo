# Cards (v1)

Calls made under the user's delegation, pending their review. Each card face shows the restaurant action and three costs; the professional name (English) appears first on the verdict card, then on the card.

| Card | Restaurant action | Placement | Money | Service time | Reputation | What it does in the night | Verdict (pattern) |
|---|---|---|---|---|---|---|---|
| Extra waiter | Hire another waiter for tonight | Global | Wage per night | Faster order taking at the peak | Protects it at the peak | Two waiters take orders in parallel, so the peak no longer overloads the floor; it also makes two waiters touch the stock board at the same time | Horizontal scaling |
| Check stock first | The waiter looks at the stock board before promising a dish | On the waiters | Free | A few seconds per order | None | Still reads, promises, and writes the board minutes later; two waiters can both read "1 fish" in that gap, so the race stays | Check-then-act (TOCTOU), an anti-pattern |
| Lock | One marker for the stock board: whoever holds it reads, promises and writes, then hands it back | On the stock board | Small | Waits when two waiters need the board at once | None | Read and write become one step; the second waiter sees "0 fish" and offers another dish | Lock (mutex) / race condition |

Rules:

- Cards may be played before the night and while paused mid-night; a card takes effect from that moment.
- Check stock first must look like the obvious fix: it is free and sounds sensible. Its failure (the alert still fires) is the lesson, and its verdict names it as a known anti-pattern.
- Lock without Extra waiter is wasted: one waiter never races, so the night is still overloaded and the lock only costs money.
