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

**Status: implemented on `feature/1.2.0-b-slots`.**

- Three ruleset-pinned three-reel machines with distinct wager limits, volatility and venue availability.
- Corner Classic is available everywhere; Neon Sevens is limited to nightlife/private/full rooms; Empire Gold is Vegas-only.
- Server-authoritative weighted reels: the browser never rolls or chooses a symbol.
- Exact integer paytables and an RTP calculator plus large-sample seeded QA simulation.
- Base RTP is pinned in the low 90s so Slots remain entertainment/a money sink rather than the main seasonal income loop.
- Every spin requires an open bankroll at the casino where the boss is physically standing.
- One immutable `SLOT_SPIN` casino-ledger receipt stores wager, payout, reels, bankroll-after and progressive contribution/award.
- Reusing the same action ID replays the saved result instead of rolling again.
- Empire Gold contributes to a persistent round-wide progressive pool; the pool row is locked before award/reset so concurrent spins cannot double-hit it.
- The progressive is jackpot-eligible only at the posted max wager.
- Responsive Slots UI shows machine limits, base RTP, progressive pool and the server-decided result. Reduced-motion users get no reel animation.
- Local seed advances to `classic-og-v1.2-b`.

#### B invariants

1. The client never supplies or derives a winning reel.
2. A retried spin never spends twice and never gets a second RNG outcome.
3. A spin can only debit the open session bankroll in the boss's current casino.
4. A machine can only be played in venue kinds listed by the pinned ruleset.
5. Progressive contribution and jackpot award/reset happen in the same database transaction as the spin.
6. Base machine RTP is reproducible from the pinned symbol weights/paytable and release-gated by simulation.

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
