# StreetsEmpire 0.5.0-F: the travel release

F closes 0.5.0. It balances the road across all eight cities against a full round of play,
opens a crew's own market to its own runs, gives the Rules page a Travel panel, and adds
the gates a travel season has to pass before it ships.

## What F adds for players

- **Load up on your own market.** A run could only take what Pip had on the shelf at home,
  which left a crew living in Miami unable to buy the port's cheap cocaine in bulk and a
  crew in the Valley cut off from its meth. The launch screen now has **Buy on the
  &lt;city&gt; market**: wholesale, out of home cash, straight into the trunk.
  - Buying only. Nobody sells on their own market, so cooking to sell still never pays.
  - Every unit you buy moves the price, and it is still moved the next time you load up.
  - The receipt lists it like any other trade.
- **Three cities changed.** Seattle's casinos pay 10% less (a quiet town), Miami's pay 5%
  less, and Pip's ecstasy in Miami is low because the clubs buy it before you can. Each
  city's street talk says so.
- **A Travel panel on the Rules page**, covering cities and street talk, runs and their
  wallet, the two markets, the road and its police, convoys, and moving house.
- **A phone pass.** Travel, the price board, the launch screen (the market grid included)
  and the move screen fit a 375px phone with no sideways scroll.

## Automated gate

From the repository root:

```powershell
npm run qa:release
```

With PostgreSQL running:

```powershell
npm run qa:release -- --with-db
```

`qa:travel` now runs five simulations against `classic-og-v0.5-f` and fails the release if
any of them break:

1. **Routes (0.5.0-A).** A run beats working the street at its best, a city has no reason
   to drive to, or a city's own prices make a same-city loop.
2. **Risk (0.5.0-C).** A market can be pumped and cashed out, a run's average strays
   outside 75%-110% of its plan, the best plan is too steady, or a run beats the street on
   average.
3. **Convoys (0.5.0-E).** A hijack win rate leaves its band with or without backup.
4. **A full round (0.5.0-F).** In any play style, start or home city, **mixed play** (the
   street, the stove and runs) fails to beat **street only**, **street and Produce** and
   **runner only**.

`qa:products` additionally runs the 0.4.0 product gates against `classic-og-v0.5-f`, so a
travel season still has no dominant product, no money loop and no single-product round.

Write the travel report with:

```powershell
npm run qa:travel -- --output docs/TRAVEL-SIMULATION-0.5.0-F.md
```

## The full-round simulation

`runTravelRoundSimulation` plays 28 days as expected values, for every combination of:

- **play style** — all day (576 turns, online sixteen hours, runs back to back) and twice a
  day (a banked 144-turn cap, two hours online a session, so a run has to reach its towns
  inside one);
- **start** — a fresh crew and a mid-round crew;
- **home** — New York, and each other city, moving there as soon as the fee is affordable;
- **strategy** — street only, street and Produce, runner only, hijacker, and three ways of
  mixing (runs for profit, supply runs, or whichever pays more).

It differs from the A simulation in one deliberate way: **the street earns the average
block, not the busiest.** Client capacity is hidden and reshuffled every hour, so a player
cannot stand on the packed block all round. That is the bar travel actually has to clear,
and it is why A's "no run beats the street" and F's "mixed beats the street" can both hold.

What it says, on this balance:

| Way to play | Against the street alone |
| --- | --- |
| Mixed (street, stove, runs) | **best everywhere**: +1% to +18% |
| Runner only | 10%-40%: a run is real-time bound and a market only absorbs so much |
| Street and Produce | level: the stove never pays a turn the street could have |
| Hijacker | −2% to −7% playing all day, +5% to +13% playing twice a day |

The hijacker line rests on assumptions a single-player simulation cannot know (a recon
finds a run worth tailing 30% of the time, at most a few hits a day, and a typical target
carries $330k out and 1,900 units back). They are in `TRAVEL_ROUND_WORLD`, and they are
the first thing to check against a real round.

## Live regression coverage

`--with-db` runs every `TRAVEL_INTEGRATION` suite:

- `travel.integration.test.ts` — runs, city counters, sightings.
- `travel-risk.integration.test.ts` — the shared high market, stops, busts and arrests.
- `relocation.integration.test.ts` — moving house.
- `convoys.integration.test.ts` — recon, tails, backup, armed escorts, the void.
- `travel-release.integration.test.ts` (new) — a launch that buys wholesale at home: home
  cash pays, the trunk fills, the trade is recorded against the home city, the market is
  pushed, stored net worth still adds up, and the launch is refused whole when the trunk is
  too small, home cannot pay, or the price moved.

## Deploying 0.5.0

Migrations since 0.4.0-E, in order:

1. `20260918090000_city_rules_in_ruleset`
2. `20260918120000_runs`
3. `20260918180000_markets_and_risk`
4. `20260919120000_relocation`
5. `20260919180000_convoys`
6. `20260919200000_armed_escorts_and_recon`

F adds no migration: loading up at home is a rule in the ruleset, not a column. Rounds keep
the ruleset they were created with, so a running 0.4.0 round is unchanged; create the next
round on `classic-og-v0.5-f`.

## What to watch in the first travel round

- **The home market at launch.** If crews load up at home and drive a short hop every time
  rather than buying where a city is cheap, the spread at home is too kind or the drive is
  too cheap.
- **Hijacking twice a day.** The simulation's assumed rate of runs in reach is a guess. If
  hijackers do better than mixed play in a real round, trim the loot caps in
  `travel.convoys.loot` rather than the win rate: a hit should still land.
- **Where people live.** Beverly Hills and Seattle pay best on the block, Detroit and
  Atlanta lean on runs, Las Vegas gains most from mixing. If everyone ends up in one city,
  the district pay in `cities` is the dial.
- **Produce.** It never pays a turn the street could have, in any situation the round
  simulation tries. That is fine while shelves cover a crew; if players cook anyway to
  cover shortfalls, the dry penalty is doing the work rather than the stove.
