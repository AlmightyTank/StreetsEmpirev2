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
- A new Deal requires the boss to be physically at the table. If the boss travels after cards are dealt, the already-started hand can still be finished against its original saved session so it can never become stranded.
- Slots cannot start a new spin while a blackjack hand is active.

#### Money settlement

- The opening wager is removed from the open casino bankroll when Deal succeeds.
- Split and Double reserve the additional wager in the same player-locked database transaction as the card action.
- Dealer play and all hand returns settle atomically after the final player hand is finished.
- Wins return 2× the hand wager, pushes return 1×, losses return zero, and a natural returns 2.5× at a 3:2 table.
- Split 21 is a normal 21 rather than a natural blackjack.
- Casino ledger receipts cover the opening wager plus wager-changing / settling blackjack actions.
- Chips committed to an unresolved hand remain part of casino/net-worth value until settlement, preventing a live wager from being used to hide ranking value.
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
9. A live blackjack hand blocks session close and new slot spins, but can still be finished if the boss has traveled since Deal.
10. Committed live wagers remain in casino/net-worth value until the hand settles.
11. Refreshing or reconnecting cannot change cards, shoe position, hand order, wager or active-hand index.
12. Settled hand history comes from durable database rows rather than client memory.
13. Historical B rulesets remain unchanged; Blackjack only exists on the pinned 1.2.0-C ruleset.


### 1.2.0-D — Roulette & Street Dice

**Status: implemented on `feature/1.2.0-d-roulette-street-dice`.**

#### Roulette

- Roulette is server-authoritative and uses the same open casino bankroll as Slots and Blackjack.
- **Street Roulette** is an American double-zero wheel available throughout the casino network.
- **European Roulette** is a single-zero private/full-room table.
- **Empire High Limit** is a Vegas-only single-zero table with larger posted limits.
- Players can cover straight-up numbers, splits, streets, corners, six lines, dozens, columns, red/black, odd/even and low/high.
- The server validates every position, posted chip increment, per-position limit and total-table limit before resolving a spin.
- Secure server RNG chooses the winning pocket from the ruleset-pinned wheel order.
- Standard returns include the original wager: straight 36×, split 18×, street 12×, corner 9×, six line 6×, dozen/column 3× and even-money bets 2×.
- Every spin is written to the shared casino ledger with the exact table, wheel, pocket, bets, returns and bankroll-after value.
- Retrying the same action ID replays the stored spin rather than selecting another pocket or charging again.
- The player UI includes a real number/outside-bet layout, selectable chips, inside-combination builder, recent-pocket strip, animated wheel and a mobile sticky Spin control.

#### Street Dice

- Street Dice is a city-flavored **pass-line point game** using real craps come-out and point rules.
- Come-out 7/11 wins; 2/3/12 loses; 4/5/6/8/9/10 establishes the point.
- Once a point is on, making the point before a 7 wins; rolling 7 first loses.
- Players can back a live point with optional server-authoritative **true odds**:
  - 4/10 pay 2:1.
  - 5/9 pay 3:2.
  - 6/8 pay 6:5.
- Street Dice supports a broad low-limit table plus a higher-stakes Back Room table with larger odds multiples.
- A live point is persisted in PostgreSQL with the original session/city, line wager, odds wager, point, last dice, roll count and bankroll snapshot.
- Refresh/reconnect restores the exact point. The point can still be finished if the boss has traveled since the come-out roll so chips cannot become stranded.
- Start, Roll and Add Odds each have durable retry receipts. Every roll also has a shared casino-ledger receipt, including no-decision rolls.
- Active line/odds wagers remain part of casino/net-worth value until the point resolves.
- A live Street Dice point blocks session close and new Slots, Blackjack or Roulette play until it settles.
- The mobile UI keeps the point, dice, bankroll, line/odds exposure and Roll control compact above the game navigation.

#### D invariants

1. The browser never chooses a roulette pocket, dice result, payout or authoritative point state.
2. A duplicate action ID never spins a second wheel, rolls a second pair of dice or moves bankroll twice.
3. Roulette validates the complete bet layout on the server before any bankroll mutation.
4. Zero/double-zero lose all even-money, dozen and column bets normally.
5. Street Dice line and odds wagers are removed from the bankroll only while holding the player lock.
6. True odds use the pinned point payout and do not carry a house-edge multiplier.
7. An unresolved point is reconnect-safe and remains tied to its original open casino session.
8. Committed Street Dice wagers stay included in total casino value until settlement.
9. A live Street Dice point cannot be bypassed by switching to another casino game or closing the bankroll.
10. Historical A/B/C rulesets remain unchanged; Roulette and Street Dice only exist on the pinned 1.2.0-D ruleset.

### 1.2.0-E — High Rollers & City Identity

**Status: implemented on the pinned `classic-og-v1.2-e2` ruleset (1.2.0-E2).**

The `classic-og-v1.2-e` id was already taken by solo/multiplayer Poker, so E ships as its own
pinned ruleset on top of it. Poker, Slots, Blackjack, Roulette and Street Dice rules are the same
objects as in 1.2.0-E: no paytable, shoe, wheel, dice rule or rake changed.

#### Rated play

- Every **charged** wager is rated at its **theoretical house win** ("theo"): posted wager × the
  game's pinned house edge. Results never matter, so a lucky night and an unlucky night at the
  same stakes rate the same.
- Pinned rating edges: Slots use the machine's own effective RTP (free spins included);
  Blackjack 0.50% (stands soft 17) / 0.70% (hits soft 17); American Roulette 5.26%, European
  2.70%; Street Dice pass line 1.41%; **true odds 0%**; Poker rates the house rake one-for-one.
- Free spins (casino-covered) and true odds add no theo, so status cannot be farmed with
  zero-edge bets. True odds still count toward total action.
- Theo and comps accumulate as `cents × bps` basis in `CasinoRating` (per player, per city), so
  thousands of small wagers lose nothing to rounding.
- Rating happens inside the same player-locked transaction that debits the wager. A replayed
  action ID returns the saved receipt before rating, so it can never rate twice.

#### Casino status

| Tier | Theo to reach | Comps (of theo) | Session bankroll ceiling |
| --- | --- | --- | --- |
| Walk-in | $0 | 0% | $1,000,000 |
| Regular | $250 | 10% | $1,000,000 |
| Preferred | $2,500 | 15% | $2,500,000 |
| High Roller | $25,000 | 20% | $5,000,000 |
| Whale | $150,000 | 25% | $10,000,000 |

- Status is network-wide for the round (theo summed across every casino city) and never decays.
- A wager earns comps at the tier held **before** it; the wager that crosses a threshold earns
  at the old rate. Reaching a tier writes a `CASINO_STATUS_UP` activity.
- Status raises the session bankroll ceiling and opens VIP rooms. That is all it does.

#### VIP rooms and city identity

- Every venue now has a **VIP room** with a minimum status and an identity (tagline, house game,
  room accent). Identity is presentation only.
- VIP tables: **Salon Blackjack**, **Salon Roulette** and **Private Dice** in every VIP room, plus
  **Black Room Blackjack** and **Black Room Roulette** in the Vegas Empire Black Room.
- Each VIP table copies the exact outcome rules of a floor table (decks, cut card, soft-17 rule,
  3:2 payout, splits/doubles, wheel, true-odds multiple) and only raises its posted limits.
- The VIP door is checked only when a **new** hand, spin or point starts. A hand already dealt
  can always be finished, even if the boss travels.

| City | Venue | VIP room | Door | Visitors need |
| --- | --- | --- | --- | --- |
| New York | Five Boroughs Card Room | The Penthouse Game | Regular | — |
| Detroit | Motor City Dice House | The Garage | Regular | 1 bodyguard |
| Miami Beach | Ocean Crown | Cabana Salon | Preferred | — |
| Seattle | Emerald Rooms | The Fern Room | Preferred | — |
| Beverly Hills | Rodeo Private Club | The Vault | High Roller | 1 bodyguard |
| Las Vegas | Empire Grand | Empire Black Room | High Roller | 2 bodyguards |
| Los Angeles | Sunset Palace | The Skybox | Preferred | — |
| Atlanta | Peachtree Club | The Magnolia Room | Regular | — |

#### Boss Trips hooks

- **Respect:** a boss visiting on a trip must bring the room's fit bodyguards (a boss riding a
  run counts the run's fit escorts). A boss at home is never asked.
- **Comped suites:** comps pay for hotel extension blocks on the boss's current trip to any
  casino city (`POST /api/game/casino/comps/hotel`). It uses the trip's normal extension rules
  (in town, max stay, round end) and moves no cash, chips or bankroll. Each redemption is an
  immutable `COMP_HOTEL` casino ledger receipt, idempotent by action ID.
- Comps never convert to cash or chips and are capped below theo, so playing for comps stays
  negative expected value.

#### Casino Front integration

- An **operating Casino Front** (built, staffed by your crew, on a block you still hold) in a
  venue's city is a **house pass**: that VIP room opens regardless of status, and the front's
  crew walks a visiting boss in.
- Play at that venue earns **+5% of theo** in extra comps.
- Front income, rackets and laundering are unchanged; no player's losses ever flow to another
  player's business.

#### Player experience

- A **High roller status** panel on the Casino page: tier, progress meter, theo, action, comp
  rate and balance, bankroll ceiling and the full ladder.
- A **VIP room** panel for the current venue: identity, door rule, whether you are in and why,
  house passes from Casino Fronts, and a **Comp the suite** button while on a trip.
- Table pickers mark VIP tables and say exactly why a VIP door is closed. Destination cards show
  each room's identity, VIP room and your most-played "home room".
- Status-ups and comped hotel stays appear in Activity and the Console market group.

#### E invariants

1. No game RNG, shuffle, roll, pocket, payout or rake reads status, comps or Casino Front state.
2. Every VIP table's outcome rules equal its floor counterpart's; only posted limits differ.
3. Theo depends only on the charged wager and the pinned edge, never on the result.
4. Free spins and true odds add zero theo.
5. A replayed action ID never rates a wager or spends comps twice.
6. Comps are always strictly below theo and can only buy hotel time; they never become cash,
   chips or net worth.
7. The VIP door is checked only on new games; an in-progress hand or point can always finish.
8. Comp-paid hotel time follows the normal trip extension limits and never wires cash.
9. Older rulesets (A–E) have no status, ratings, VIP tables or comps.

### 1.2.0-F — Casino Jobs & Rewards

**Status: implemented on the pinned `classic-og-v1.2-f` ruleset (1.2.0-F).**

F builds on 1.2.0-E2. The casino block is the same object: no odds, limits, rake, status
thresholds or comp rates change.

#### Ace, the casino host

- New Jobs contact **Delia “Ace” Navarro**, *Casino Host*. She keeps the guest list for the
  circuit: she decides who gets recognized, comped and let through the velvet rope.
- Ace's standing is stored like every other contact (`PlayerReputation`, trader `ACE`) and shows
  on the Jobs page. The Casino page links to her Jobs.

#### Casino Job signals

Casino games now tell Jobs what happened, from inside the same transaction that moved the chips
and after the action-ID replay check:

| Signal | When | Payload |
| --- | --- | --- |
| `CASINO_WAGER` | A rated wager is charged (slots, blackjack deal/double/split, roulette, Street Dice line/odds), or a poker buy-in | game, table, room (`FLOOR`/`VIP`), city, wager, theo |
| `CASINO_RESULT` | A hand, spin, point or solo poker hand settles | game, table, room, city, stake, return, net, `won`, highlight |

Highlights: `NATURAL`, `JACKPOT`, `MEGA_WIN`, `BIG_WIN`, `STRAIGHT_UP`, `POINT_MADE`,
`SHOWDOWN_WIN`. Quest receipts are keyed on the action ID, so a retried action never advances a
Job twice. Existing activities (`CASINO_SESSION_OPENED`, `CASINO_COMP_HOTEL`) also drive Jobs, and
the quest state now carries `casinoTheoCents` so status Jobs complete even if the tier was reached
before the Job was accepted. Only rulesets with rated play emit these signals.

#### Ace's Jobs (all one-time)

| Job | Needs | Objective | Pays |
| --- | --- | --- | --- |
| House Rules | — | Open a floor bankroll; place 5 wagers (bonus: win one) | +10 Ace |
| Tour of the Floor | House Rules | Wager on 4 different games (bonus: all 5) | +15 Ace, *Floor Walker* title |
| Known Face | House Rules | Reach Regular status | +15 Ace |
| Natural Talent | House Rules | Be dealt a natural blackjack | +10 Ace, *Natural* title |
| Road Game | Tour of the Floor | Wager at casinos in 3 cities (bonus: comp a hotel stay) | +20 Ace, *Road Gambler* title |
| On the House | Known Face | Spend comps on a trip's hotel stay | +15 Ace |
| Behind the Velvet Rope | Known Face, 30 Ace | Place 5 wagers at VIP tables | +20 Ace, *Behind the Rope* title |
| The Black Room | Velvet Rope, Road Game, 80 Ace | Reach High Roller; place 3 wagers in the Vegas Black Room | +40 Ace, *Black Room Regular* title, **Velvet Rose** accent, **Velvet Rope** frame |

**Guardrail:** casino Jobs pay contact standing and cosmetics only. They never pay cash, items,
product or turns, so a Job can never make gambling a better way to earn seasonal money.

#### Casino achievements and titles

Eight new season feats in a new **Casino** achievement category. Each one unlocks a profile title
and nothing else:

| Feat | Rarity | Earned by | Title |
| --- | --- | --- | --- |
| First Chip | common | First rated wager | Fresh Chip |
| Casino Circuit | uncommon | Rated wagers in 3 cities in one season | Circuit Player |
| Velvet Regular | uncommon | 10 VIP table wagers in one season | Velvet Regular |
| House Guest | rare | $5,000 of comps spent on hotels in one season | House Guest |
| Big Night | rare | $100,000 net on one hand, spin, roll or poker hand | Big Night Boss |
| Grand Tour | epic | Rated wagers at all 8 casinos in one season | Grand Tour Gambler |
| Jackpot Hitter | epic | A progressive slot jackpot | Jackpot Hitter |
| Whale | legendary | $150,000 of rated theo in one season | The Whale |

Feats are derived from `CasinoRating` (new columns: `vipWagers`, `jackpots`,
`biggestWinCents`). Progress on the theo, comps and biggest-win feats is hidden from other viewers
during a live season, like the business-income feats.

#### F invariants

1. Casino Jobs and feats never pay cash, chips, items, product or turns.
2. No Job, feat, title or cosmetic is an input to any game's odds, limits or payout.
3. A retried casino action never advances a Job twice (receipts keyed on the action ID).
4. Free spins emit a result but no wager; true odds emit a wager with zero theo.
5. Casino money totals (theo, comps, biggest win) stay sealed from other viewers mid-season.
6. Older rulesets (A–E2) have no Ace, no casino Jobs and no casino cosmetics.

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
