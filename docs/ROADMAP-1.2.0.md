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

**Status: feature-complete on `feature/1.2.0-b-slots-experience`.**

#### Games and wagering

- Three ruleset-pinned cabinets scale in complexity:
  - **Corner Classic:** 3 columns × 3 rows, 5 selectable paylines.
  - **Neon Sevens:** 4 columns × 3 rows, 10 selectable paylines.
  - **Empire Gold:** 5 columns × 3 rows, 20 selectable paylines and the Vegas progressive.
- Players choose exact paylines plus a bet per line. The server calculates total wager as `bet per line × selected lines`.
- Wins run left-to-right from reel 1 and require at least three consecutive matching symbols. Four- and five-reel cabinets have separate 4/5-of-a-kind awards.
- The maximum paid spin remains $100 on Corner Classic, $500 on Neon Sevens and $2,500 on Empire Gold when every line is active.
- Corner Classic is available everywhere; Neon Sevens is limited to nightlife/private/full rooms; Empire Gold is Vegas-only.

#### Real cabinet behavior

- Each machine now owns a pinned **circular virtual reel strip per reel**. The server chooses one stop per reel and derives top/middle/bottom symbols from adjacent strip positions.
- The immutable spin receipt stores the authoritative reel stops and complete visible grid. The browser only animates toward that already-decided result.
- Reels visually run and stop one at a time. A genuine high-value near miss can slow the final reel only when the server result really has the needed symbol one visible stop above/below the selected payline.
- Winning symbols pulse, the active winning payline is drawn across the cabinet, multiple winning lines cycle, and the payout counts upward.
- Win tiers provide separate **WIN / BIG WIN / MEGA WIN / JACKPOT** presentation.
- Corner Classic, Neon Sevens and Empire Gold have distinct cabinet treatments instead of one generic grid.
- Synthesized Web Audio adds spin, reel-stop, anticipation, win, free-spin and jackpot cues without shipping external audio files.
- Sound can be muted and the preference persists locally.
- `prefers-reduced-motion` removes reel/win motion and reveals the same authoritative result immediately.
- On mobile, the wager/Spin controls remain sticky above the fixed game tab bar so the reel window stays visible while playing.

#### Random free spins

- Only a **paid spin** can randomly award a bonus. The initial trigger chance is **1.00%** and lives in the pinned ruleset.
- A triggered bonus awards a weighted bundle of **1 / 2 / 3 / 5 / 10** free spins. One is common within the bonus; larger bundles get progressively rarer and ten is exceptionally rare.
- The bonus persists in PostgreSQL with the exact city, machine, bet per line and selected paylines that earned it.
- Every free spin uses that same configuration. The player cannot lower the wager to earn the bonus and then raise it for the comped spins.
- The free spin has its normal nominal wager for payout/jackpot math, but **$0 is debited from the player's bankroll**. Every payout is credited normally and belongs to the player.
- Pending free spins survive refresh/reconnect. Paid slot wagers are paused until the awarded bundle is finished.
- Free spins do **not** retrigger another free-spin bundle in B. This keeps the long-run return bounded and easy to simulate.
- The casino history clearly marks free spins as casino-covered and records winnings normally.

#### Fairness, money and balance

- Exact cent-rounded line paytables preserve the existing low-90s base RTP.
- The release simulator now includes the expected value and observed payouts of all awarded free spins, and reports both **base RTP** and **effective RTP**.
- Empire Gold's progressive remains eligible only at the maximum line bet with all 20 paylines active.
- Progressive contribution, award/reset, free-spin consumption/award and bankroll settlement occur in the same player-locked database transaction.
- A retried action ID replays the same stored reel stops/result rather than spending, awarding or consuming again.
- The player-facing Casino history uses readable transaction summaries rather than raw ledger event names.

#### B invariants

1. The client never supplies or derives a reel stop, winning grid, winning line, near miss, free-spin award or payout.
2. One server-selected stop per virtual reel fully determines the visible three-row result.
3. A retried spin never spends twice, consumes a free spin twice, awards a bonus twice or gets a second RNG outcome.
4. The server recomputes total wager from the posted line bet and validated selected paylines.
5. A free spin debits zero chips but uses the exact nominal wager configuration that earned its persisted bundle.
6. Free spins cannot retrigger in B and paid slot spins cannot bypass a pending bonus.
7. A spin can only use an open bankroll in the boss's current casino; a bonus remains durable if the player closes the session and returns later.
8. Only selected paylines can pay, and line wins are evaluated left-to-right from reel 1.
9. Authentic near-miss presentation is derived from adjacent symbols on the actual stored reel result and never manufactured by the client.
10. Progressive contribution and jackpot award/reset happen atomically with the spin.
11. Base and effective RTP use the same cent-rounded payout math as resolved spins and are release-gated by large-sample simulation.
12. Sound and animation are presentation only: disabling them never changes timing, odds, cost or payout.


### 1.2.0-C — Blackjack

**Status: feature-complete on `feature/1.2.0-c-blackjack`.**

#### Tables and rules

- Three ruleset-pinned blackjack tables:
  - **Street Blackjack:** $10–$1,000, six-deck shoe, dealer stands on soft 17, available in every casino room.
  - **Neon Blackjack:** $100–$5,000, four-deck shoe, dealer stands on soft 17, nightlife/private/full rooms.
  - **Empire High Limit:** $1,000–$25,000, two-deck shoe, dealer hits soft 17, Vegas full-casino only.
- Natural blackjack pays **3:2**.
- Hit, Stand, Double and Split are all server-authoritative actions.
- Exact-rank pairs can split up to four player hands.
- Double after split is enabled.
- Split aces receive one card each and then stand.
- Every table owns ruleset-pinned minimum, maximum and wager step values.

#### Server-owned shoe

- The browser never creates, shuffles or draws a card.
- Every player/table pair has a persisted server-owned shoe with its exact shuffled card order, cursor and shuffle number.
- Secure server RNG shuffles the shoe.
- A cut-card threshold triggers a new shoe **between hands only**. An in-progress hand never changes shoes.
- The dealer hole card is persisted on the server but hidden from API responses until the hand settles.
- The UI can display cards remaining and the current shuffle number without revealing the next card.

#### Reconnect-safe hands

- One active blackjack hand is allowed per player.
- Player hands, dealer cards, split-hand order, wagers, active hand index, shoe cursor and bankroll-after values are persisted in PostgreSQL.
- Refresh/reconnect restores the exact active hand.
- Settled hands remain as the last-20 hand history.
- Every Deal / Hit / Stand / Double / Split action has a durable action receipt. Reusing an action ID replays the saved post-action hand snapshot rather than drawing or charging again.
- A casino session cannot be closed while a blackjack hand is active.
- Slots cannot start a new spin while a blackjack hand is active.

#### Money settlement

- The opening wager is removed from the open casino bankroll when Deal succeeds.
- Split and Double reserve the additional wager in the same player-locked database transaction as the card action.
- Dealer play and all hand returns settle atomically after the final player hand is finished.
- Wins return 2× the hand wager, pushes return 1×, losses return zero, and a natural returns 2.5× at a 3:2 table.
- Split 21 is a normal 21 rather than a natural blackjack.
- Casino ledger receipts cover the opening wager plus wager-changing / settling blackjack actions.
- Blackjack never reads or mutates browser-computed totals or outcomes.

#### Player experience

- Blackjack lives on the existing Casino page underneath Slots and shares the same chips/session bankroll.
- The table selector shows room availability, limits and deck count.
- The felt shows the dealer up-card, hidden hole card, every split player hand, totals, wagers, returns and active-hand highlighting.
- Context-aware Hit / Stand / Double / Split buttons only enable when the persisted hand permits the action.
- The wager control has + / − / Max controls and enforces posted table increments.
- The bankroll, total wager, return, net and shoe status stay visible during the hand.
- Mobile layouts collapse tables and split hands cleanly, with a sticky Deal control above the game navigation.
- Reduced-motion mode disables card-deal motion without changing gameplay.

#### C invariants

1. The client never shuffles a shoe, selects a card, reveals a hole card, computes an authoritative hand total, settles an outcome or chooses a payout.
2. A hand always consumes cards from one persisted server-owned shoe.
3. The cut card can reshuffle only before a new Deal, never during an active hand.
4. A duplicate action ID never draws a second card, doubles/splits twice or moves bankroll twice.
5. An opening wager, split wager or double wager is debited only while holding the player lock.
6. Dealer play starts only after every non-busted player hand has finished.
7. Natural blackjack is decided from the original two-card hand and pays the pinned blackjack ratio; split 21 does not.
8. The dealer hole card stays hidden until settlement.
9. A live blackjack hand blocks session close and new slot spins.
10. Refreshing or reconnecting cannot change cards, shoe position, hand order, wager or active-hand index.
11. Settled hand history comes from durable database rows rather than client memory.
12. Historical B rulesets remain unchanged; Blackjack only exists on the pinned 1.2.0-C ruleset.


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
