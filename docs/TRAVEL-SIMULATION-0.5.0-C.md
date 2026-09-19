# Travel risk simulation - 0.5.0-C

0.5.0-C keeps the route economics chosen in 0.5.0-A and drives those routes through the
systems that can now move the result: Pip supply swings, gluts and droughts, the shared
high market, police stops, sale Heat, busts and arrests.

The executable source of truth is `packages/rules-engine/src/simulations/travel-risk.ts`.
Run `npm run qa:travel -- --quiet` for the gate, or run `npm run qa:travel` to print the
full route and risk tables.

## Gate

For each crew, the best planned routes from the A simulation are replayed across seeded
rounds and departure times, with starting Heat spread from 0 to 60 and enough cash to
cover the planned buy plus 10%.

C fails if any of these are true:

- a market can be pumped by buying and selling back, or dumping and buying back, at the
  tested order sizes and recovery waits;
- a run averages more net worth per turn than the best street-work baseline;
- a profitable route's average lands outside 75%-110% of its no-risk plan;
- the best plan is too steady: its 10th percentile must be at or below 85% of plan and
  its 90th percentile at or above 110%.

The default risk simulation uses 400 samples per selected plan. The release gate runs
`qa:travel`, so these checks fail the release just like the A route checks do.

## C tuning

### High market

- price recovery half-life: **90 real minutes**
- maximum stored push: **-90% / +100%**
- stale-quote tolerance: **2%**
- every unit moves price against the trader according to the city's market depth
- buyers never get the high market as a discount around Pip's local counter

### Pip supply and price events

- supply slot: **240 minutes**
- base move chance at a city swing of 1: **50%**
- large-move share: **30%**
- loud supply-change wire share: **50%**
- maximum independent market drift at swing 1: **20%**
- event slot: **720 minutes**
- base event chance at a city swing of 1: **35%**
- glut: **6 hours**, plentiful supply, market baseline x **0.6**
- drought: **6 hours**, Pip out, market baseline x **2.0**

All schedule decisions are seeded from the round, city, product and slot. Reading the
same round twice produces the same history and does not reveal future slots.

### Road stops

The base chance is **0.12% per drive hour** on a road with police 1 before modifiers.
Cargo, Heat and the road's police rating raise it. Escorts cut it down to a floor.

A landed stop takes **25%** of each product in the trunk and **10%** of run cash.
Each completed leg is rolled once and recorded through `Run.roadChecks`, so refreshing
or settling repeatedly cannot reroll the same road.

### Sale Heat, busts and arrests

Selling on a run adds Heat from the sale size and the town's police pressure. The square
root curve makes splitting sales worse rather than a way around Heat.

The base C arrest rules are:

- NYC arrest line: **90 Heat**
- chance at max Heat: **25%**
- home seizure: **75%** of product
- home cash fine: **15%**
- Heat drop: **60**
- home downtime: **120 minutes**
- run arrest: the whole trunk plus **50%** of run cash, then the run heads home

City rules replace the Heat thresholds when a run is in that city.

## Live regression coverage

`apps/server/src/services/__tests__/travel-risk.integration.test.ts` covers shared market
ordering, stale quotes, immediate round-trip loss, one road-stop roll per leg, run arrest
consequences, home arrest downtime, the street wire, and hiding unseen city prices.

The current development seed uses `classic-og-v0.5-c`, so ordinary local testing reaches
these systems instead of stopping at B.
