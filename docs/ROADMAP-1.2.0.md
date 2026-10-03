# StreetsEmpire v1.2.0 — Casino & Gambling Expansion

## Theme

Make casinos real destinations without making gambling the main way to earn seasonal money.

> Earn money in the StreetsEmpire economy. Choose how much of it to risk at the casino.

The casino never uses real-money purchases and no paid feature changes gambling odds.

## 1.2.0-A — Casino Foundation

**Status: implemented on `feature/1.2.0-a-casino-foundation`.**

A deliberately ships no resolved gambling game. It builds the money and presence layer every later game uses:

- Eight ruleset-pinned casino venues, one per city.
- Las Vegas is the only full casino; other cities have private, nightlife or underground identities.
- The boss must physically be in town to use a cage or open a bankroll.
- Away from home, the cage uses only the cash physically carried in the boss trip/run wallet; protected home cash cannot be wired into destination chips.
- City-scoped chip wallets: Vegas chips stay at the Vegas cage until the boss returns.
- Dollar-for-dollar cash ↔ chip exchange.
- One open session bankroll per player.
- Closing a session is always allowed so a bankroll can never be stranded by travel.
- Chips in wallets and an open bankroll remain part of net worth at the normal cash valuation, so cage transfers cannot change ranking value.
- Immutable casino ledger receipts for buy, redeem, session open and session close.
- Every money-moving call uses a client action ID; retries replay instead of charging twice.
- Player Casino page, mobile layout, city balances and recent casino ledger.
- Casino activity appears in the existing Console/Activity market group.
- Older pinned rulesets have no casino block and continue unchanged.

### Initial limits

- Chip unit: **$1**
- Cage exchange: **$100–$5,000,000**
- Session bankroll: **$100–$1,000,000**

These are ruleset values rather than constants in the service.

## Planned slices

### 1.2.0-B — Slots

**Status: implemented and expanded with casino-style reel grids/paylines.**

- Three ruleset-pinned cabinets scale in complexity instead of sharing one three-reel layout:
  - **Corner Classic:** 3 columns × 3 rows, 5 selectable paylines.
  - **Neon Sevens:** 4 columns × 3 rows, 10 selectable paylines.
  - **Empire Gold:** 5 columns × 3 rows, 20 selectable paylines and the Vegas progressive.
- Players choose the exact paylines they want active plus a **bet per line**. The authoritative total wager is `bet per line × selected lines`.
- Winning lines read left-to-right from reel 1 and require at least three consecutive matching symbols; 4- and 5-reel cabinets have larger 4/5-of-a-kind paytable entries.
- The old maximum total-spin stakes are preserved: Corner Classic tops out at $100, Neon Sevens at $500 and Empire Gold at $2,500 when every line is active.
- Corner Classic is available everywhere; Neon Sevens is limited to nightlife/private/full rooms; Empire Gold is Vegas-only.
- Server-authoritative weighted symbols: the browser never rolls a cell, chooses a stop, evaluates a win or decides a payout.
- Exact cent-rounded line paytables and RTP calculations plus large-sample seeded QA simulation keep the base games in the low-90s RTP band.
- Every spin requires an open bankroll at the casino where the boss is physically standing.
- One immutable `SLOT_SPIN` receipt stores the full three-row grid, line bet, selected paylines, winning lines, total wager, payout, bankroll-after and progressive contribution/award.
- Reusing the same action ID replays the saved grid instead of rolling again; changing the line bet or selected lines with that ID is rejected.
- Empire Gold contributes to a persistent round-wide progressive pool. Jackpot eligibility requires its maximum line bet with **all 20 paylines active**, and the pool row is locked before contribution/award/reset.
- The player UI renders 3×3, 4×3 and 5×3 cabinets, selectable T/M/B line paths, winning-line overlays, credits, total-bet meters, paytables and reduced-motion-safe reel animation.
- Local seed remains pinned to `classic-og-v1.2-b`.

#### B invariants

1. The client never supplies or derives a winning grid, winning line or payout.
2. A retried spin never spends twice and never gets a second RNG outcome.
3. The server recomputes total wager from the posted line bet and validated selected paylines.
4. A spin can only debit the open session bankroll in the boss's current casino.
5. A machine can only be played in venue kinds listed by the pinned ruleset.
6. Only selected paylines are eligible to pay, and line wins are evaluated left-to-right from reel 1.
7. Progressive contribution and jackpot award/reset happen in the same database transaction as the spin.
8. Base machine RTP uses the same cent-rounded line payouts as resolved spins and is release-gated by simulation.

### 1.2.0-C — Blackjack
Server-owned shoe, hit/stand/double/split, table limits, hand history and reconnect-safe hands.

### 1.2.0-D — Roulette & Street Dice
American roulette plus city-flavored dice rooms, both using the same wager ledger.

### 1.2.0-E — High Rollers & City Identity
Casino status, VIP rooms, Boss Trips hooks and Casino Front integration without changing odds.

### 1.2.0-F — Casino Jobs & Rewards
Casino contact, Jobs, achievements, titles and cosmetics.

### 1.2.0-G — Tournaments
Equal-bankroll competitive formats, weekly boards and seasonal casino records.

### 1.2.0-H — Balance, Admin & Release
Admin casino telemetry, anti-abuse, large-sample simulations, mobile/reconnect regression and release gate.

## A invariants

1. Casino balance transfers never create or destroy net worth.
2. A retry with the same action ID never moves money twice.
3. A player cannot open two bankroll sessions at once.
4. Cashier operations require the boss to be standing at that city's venue.
5. A session can always be closed, even after the boss travels away.
6. Old rulesets never acquire casino behavior accidentally.
7. No client animation or future game client is allowed to authoritatively choose an outcome.
