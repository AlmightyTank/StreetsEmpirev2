# Sportsbook limits - 1.8.0-D

`npm run qa:sportsbook` plays 2,000 seeded 28-day rounds per betting style. Each day has 24 pregame moneylines priced with a 4.5% bookmaker margin. Cash on hand grows from $5,000 toward the $11M median engaged net worth in BALANCE-1.0.0-D (about a third of it on hand), and every ticket settles before the next day. Figures are the sportsbook's own result for one player over a whole round. The script exits 1 if a 1.8.0-D band fails.

The question is not whether the house wins (with a margin on every line it does, slowly) but how far one player can climb the leaderboard on sportsbook cash alone.

## Styles

- **recreational**: three tickets a day at 1% of cash on random sides.
- **longshot**: the ten biggest underdogs each day, as much as allowed.
- **favourite**: the ten heaviest favourites each day, as much as allowed.
- **sharp**: twelve tickets a day on delayed lines that have already moved elsewhere, a real +3% edge on every ticket. The board uses a cached, possibly delayed feed, so this is the realistic abuse case.
- **allIn**: half of cash on the day's biggest underdog.

## Results

| Limits | Style | Median | p95 | p99 | Best run | p99 vs median net worth | House hold | Staked per round |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1.8.0-A | recreational | -$30,797 | $207,370 | $343,647 | $531,131 | 3.1% | 4.0% | $459,409 |
| 1.8.0-A | longshot | -$3,850,000 | $14,678,347 | $29,262,880 | $50,339,184 | 266.0% | 2.2% | $11,445,177 |
| 1.8.0-A | favourite | -$582,978 | $1,280,513 | $2,021,475 | $3,304,048 | 18.4% | 4.2% | $13,665,846 |
| 1.8.0-A | sharp | -$1,022,765 | $10,279,888 | $21,201,830 | $32,607,674 | 192.7% | -3.2% | $16,091,464 |
| 1.8.0-A | allIn | -$3,042,638 | $9,309,239 | $18,421,616 | $29,719,793 | 167.5% | 7.5% | $4,511,858 |
| 1.8.0-D | recreational | -$17,647 | $126,986 | $187,150 | $273,307 | 1.7% | 4.0% | $379,530 |
| 1.8.0-D | longshot | -$83,373 | $389,465 | $620,223 | $1,145,732 | 5.6% | 4.4% | $1,764,118 |
| 1.8.0-D | favourite | -$80,831 | $58,045 | $117,302 | $155,883 | 1.1% | 4.3% | $1,936,522 |
| 1.8.0-D | sharp | $54,866 | $429,323 | $572,445 | $856,647 | 5.2% | -3.1% | $1,935,801 |
| 1.8.0-D | allIn | -$15,447 | $143,906 | $207,625 | $314,670 | 1.9% | 4.8% | $138,204 |

Under the 1.8.0-A limits (only a $1,000,000 per-ticket cap), one lucky long-shot or sharp round is worth two to three times a median player's whole net worth. Under 1.8.0-D, the best 1% of rounds for every style stay within about 6% of it, and a recreational bettor sees the same ~4% hold as before.

## Limits

All of them live in `SPORTSBOOK_LIMITS` (`packages/shared/src/sportsbook.ts`). The server enforces them inside the wager transaction. The bet slip runs the same check so it can show the top stake for the selected price.

| Limit | Value | Why |
| --- | ---: | --- |
| Minimum ticket | $10 | Keeps ticket rows meaningful; a day-one boss with $5,000 can still play. |
| Maximum ticket | $25,000 | The smallest casino table maximum. |
| Most one ticket can win | $50,000 | The jackpot control: at +400 the top stake is $12,500, at +1000 it is $5,000. |
| Per game, per player | $25,000 | Both sides and every ticket on one game count, so a game cannot be laddered with many maximum tickets. |
| Placed in the last 24 hours | $125,000 | Bounds a delayed-line edge: about $3,750 a day in expectation at +3%. |
| Open tickets | $150,000 and 20 tickets | Bounds money riding on tomorrow's slate as well as today's. |
| One side of one game, all players | $1,000,000 potential winnings | One bad or stale line cannot pay out without limit when many players pile on. |

Tuning used `--limits '{...}'` to compare candidates against the bands. The sharp style's p95 was the binding band; the daily limit is its main lever.

## Bands (1.8.0-D)

- Sharp p95 within 5% of median engaged net worth ($550,000).
- Longshot, favourite and all-in p99 within 10% ($1,100,000).
- Recreational hold between 1% and 8%.
- Largest ticket no bigger than the largest casino table bet ($100,000).

## What the integration tests prove

`sportsbook.integration.test.ts` (PostgreSQL, `TURF_INTEGRATION=1`):

- **Repeat requests**: three racing requests with one action ID make one ticket and one debit. A retry after the line moves returns the ticket at its pinned price, and a reused ID with a different stake is refused.
- **Concurrent wagers**: five racing $10,000 tickets against $30,000 of cash make exactly three, leaving cash at $0 and never negative. Eight racing $20,000 tickets stop at the $125,000 daily limit.
- **Limits**: the long-shot win cap, both sides counting toward the per-game cap, the shared side limit across players, and the open-ticket count.
- **Cash location**: a wager spends the trip bankroll in Las Vegas, not home cash. A result paid in town goes to the trip bankroll and one paid after the trip returns goes to home cash. Mid-relocation there is no cash on hand to bet, but a result still pays home cash.
- **Pushes and cancellations**: a tie refunds the stake, a void refunds the stake, a loss pays nothing, and a win pays the payout pinned at acceptance even after the line moves.
- **Late provider updates**: re-grading every settled game with corrected scores changes nothing and pays nothing.
- **No-turn rule**: placing and settling tickets leaves turns untouched.

Wagers lock the game row before the player row, the same order settlement uses, so a wager racing a settlement cannot deadlock. The game lock also serialises the shared side limit.

## Not covered

- Limits are game-wide constants, not part of a pinned ruleset. Moving them into rulesets is part of the 1.8.0-E historical-ruleset review.
- The simulation models one player at a time; the side limit is exercised by the integration test rather than the simulation.
