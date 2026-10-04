# Casino playability audit — 1.2.0

An end-to-end check that every casino game on the current ruleset (`classic-og-v1.2-e`) is playable and works the way
[ROADMAP-1.2.0.md](ROADMAP-1.2.0.md) describes. It covered the pure rules-engine math, the server services (money
movement, locking, retries, presence), and the web panels.

## How it was checked

- Ran the existing rules-engine suites and the PostgreSQL integration suites (`TURF_INTEGRATION=1`) for every game.
- Checked payout math against exact odds instead of samples.
- Fuzzed the multiplayer Hold'em engine with 20,000 random hands of 2–6 seats and mixed stacks.
- Simulated 60,000 solo Hold'em hands for each of five player strategies.
- Read every service path that moves chips and compared it with the roadmap invariants.

## Results by game

| Game | Result | Notes |
| --- | --- | --- |
| Slots | ✅ Works as intended | Base RTP 92.69% / 91.50% / 92.09% (Corner Classic / Neon Sevens / Empire Gold); about 1 point more with free spins. Paylines, free-spin lock and progressive match the roadmap. |
| Blackjack | ✅ Works as intended | 3:2 naturals, split 21 is not a natural, split aces take one card each, dealer peeks, the shoe reshuffles only between hands, and the hole card stays hidden. |
| Roulette | ✅ Works as intended | Every bet type returns exactly 94.74% on the American wheel and 97.30% on the European wheel. Inside-bet validation matches the board. |
| Street Dice | ✅ Works as intended | Pass-line win probability is exactly 244/495 (49.29%). True odds pay 2:1, 3:2 and 6:5, and every posted chip step divides evenly. |
| Solo Hold'em | ❌ → ✅ Fixed | The player could win money without skill (see below). |
| Multiplayer Hold'em | ⚠️ → ✅ Fixed | The engine is sound: no chip leaks or stuck turns in 20,000 fuzzed hands, and the button, blinds, big-blind option and heads-up order are correct. Table handling had playability bugs. |

## Bugs fixed

### 1. Two sets of trips were scored as three of a kind (all Hold'em)

`evaluatePokerHand` only made a full house when a second rank appeared exactly twice. With seven cards such as
7-7-7-5-5-5-2, it returned three of a kind with too few kickers, so that hand lost showdowns it should have won. A second
set of trips now fills the house.

### 2. Solo Hold'em paid out to a strategy that needs no skill

- **The player never posted a blind.** The player was always on the button, and Mack and Rico always paid the blinds,
  so folding every hand cost nothing. The button now moves one seat per solo hand, so the player posts the small blind
  and big blind in turn.
- **Bots folded almost everything to any bet.** The bots' call pressure divided a bet measured in cents by 100, so it
  hit its maximum on any bet. On top of that, post-flop hand strength was scaled so that only a full house or better
  would call. The bots now weigh a bet against the pot (pot odds), and post-flop strength uses the same 0–1 scale as
  pre-flop.

Average result per hand, 60,000 simulated hands each (BB = big blind, $1):

| Player strategy | Before | After |
| --- | --- | --- |
| Always raise | **+2.035 BB** | −0.138 BB |
| Always call / check | +0.130 BB | −0.047 BB |
| Fold whenever a bet is due | 0.000 BB (free) | −0.177 BB |
| Raise only with a made pair or better | — | −0.413 BB |
| Tight-aggressive (raise strong hands, fold weak ones) | — | +0.145 BB |

Strategies that need no skill now lose to blinds and rake. A player who chooses their hands sensibly keeps a small edge
over the house bots, which fits a skill game and is worth cents per hand at these blinds.

### 3. A seated player could not see a multiplayer table while a hand was being played

A player who stayed seated with no chips is not dealt into the next hand. While that hand was live, the table view
threw `POKER_STATE_INVALID` for them, so their panel showed an error every 2.5 seconds. They can now watch the hand.

### 4. One idle player could freeze a multiplayer table

Seats can leave only between hands, and nothing timed out a turn. A player who walked away mid-hand locked every other
player's buy-in at the table, and the casino bankroll that funded it, with no way out. Now, once a turn has waited 60
seconds (`POKER_TURN_TIMEOUT_MS`), any other player in the hand can press **Skip idle player**
(`POST /game/casino/poker/tables/:id/timeout`). The idle seat checks if it owes nothing and folds otherwise. The request
uses the same action-ID replay receipts as normal table actions.

### 5. Poker chips dropped out of net worth while in play

Committed Blackjack and Street Dice wagers stay in casino value and net worth until they settle, as the roadmap
requires. Poker chips did not: a solo buy-in, and a multiplayer stack held at a table between hands, vanished from both
until the chips went back to the bankroll. `pokerCommittedCents` now counts the solo buy-in, each multiplayer seat
stack, and that seat's share of a live pot.

### 6. Multiplayer tables skipped the "boss must be in the room" rule

Creating or joining a table used the player's home city. Every other game uses where the boss is actually standing and
checks that the venue offers the game. Table create and join now use the same presence and venue-kind checks as solo
Poker.

## Noted, not changed

- **Blackjack shoe on Empire High Limit.** The two-deck shoe reshuffles below 34 cards. A four-way split made entirely of
  small cards could in theory run the shoe dry mid-hand (`BLACKJACK_SHOE_EMPTY`). This is extremely unlikely, and
  raising the cut card is a balance decision.
- **Solo Hold'em is simplified on purpose.** Bots never bet or raise, the player always acts first on each street, and
  when the player folds the pot goes to the bot with the stronger hole cards without playing out the board.
- **Multiplayer short all-in.** An all-in for less than a full raise does not stop players who already acted from
  raising again. Standard rules would allow them only to call or fold.
- **Slots progressive.** Free spins still feed the jackpot pool their nominal contribution, funded by the house.
- **Before/after net worth on street actions.** The rank movement shown for a street action counts casino wallets and
  the open bankroll, but not wagers that are still in play. Player-state settlement corrects it right after the action.
  This was already true for every casino game before this audit.
