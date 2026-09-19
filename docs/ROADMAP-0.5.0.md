# 0.5.0 roadmap - Travel

Status: **in progress.** 0.5.0-A through E are built. F is planned.

0.4.0 turned Product into an economy with six products, prices, cooking and Heat. 0.5.0
gives that economy somewhere to go. Everyone starts in New York, and there are two ways to
leave it:
- **A run.** Load up Low-Riders with cash and product, drive to other cities, buy low and
  sell high, and come home. A run only has what it took with it.
- **Relocation.** Move the whole operation to another city for a fee and some downtime.

0.5.0 follows the 0.4.0 pattern: lettered stages, each with a gate, each shipping in its
own pinned ruleset (`classic-og-v0.5-a`, `-b`, ...) so older rounds keep their rules.

## Where 0.4.0 leaves us

- **Cities exist but only one is used.**
  - Eight `City` rows are seeded: New York City, Detroit, Miami Beach, Seattle, Beverly
    Hills, Las Vegas, Los Angeles and Atlanta.
  - Only NYC is enabled, and `startingCitySlug` puts every player there.
- **City tuning is in the wrong place.**
  - `City` carries `scoutModifier`, `incomeModifier` and `crackModifier`, all 1.0.
  - `calculateScout` and Produce already read them.
  - Balance belongs only in `packages/rulesets`, so these move into the ruleset.
- **Everything is same-city.** Raids, drive-bys, recon, the target list, local rank and
  the Discord city feed all compare `RoundPlayer.cityId`. Relocation changes that one
  field, so most of them follow a move without changes.
- **Low-Riders do almost nothing.**
  - They carry `thugsPerLowRider` shooters on a drive-by, count toward net worth, and are
    one of Charlie's favours.
  - They have no cargo use.
- **Product selling is a loss by design.**
  - Pip pays back 30% of what he charges for every product.
  - Net worth values a unit at no more than Pip pays for it.
  - Ingredients cost at least what Pip pays, so cooking to sell loses money.

  Travel is the first place selling can pay. That is the point of 0.5.0, and also its
  biggest balance risk.
- **Heat is one number per player** (0.4.0-C). It is raised by product and brought down
  over time or by a bribe.

## Decisions

- **Everyone starts in NYC (decided).** `startingCitySlug` stays `new-york-city`, and there
  is no city picker at join.
- **Runs carry their own wallet (decided).**
  - A run takes Low-Riders, optional escort thugs, **cash** and **product** out of your home
    stock. What it took is all it has.
  - In town, a run buys only with the cash in the car and sells only what is in the trunk.
    There is no wiring money from home.
  - A run can drive on from one city to the next: buy cocaine in Miami and sell it in
    Beverly Hills.
  - Getting more of anything means going home. When the run is back, everything it holds
    (cash, product and cars) merges into home stock.
  - Your operation at home keeps working while a run is out: the run is a crew on the road,
    not you. Home just has less to work with, because the run took cars, thugs, cash and
    product.
- **Relocation for a fee and downtime (decided).**
  - Moving the whole operation (stable, stock, cars, hideout) to another city costs a fee
    priced on net worth, with a floor.
  - The move takes some downtime: hours in which you cannot act.
- **Two markets in every city (decided).**
  - **The street counter** is Pip's, and he has a counter in every city. It is per player,
    at a normal rate.
    - It works like Pip's shelves today: your own lazy-restock stock, so other players
      cannot buy it out from under you.
    - **Each city's counter is stocked differently.** Every product has a **supply level**
      in every city: plentiful, normal, low or out. Some cities do not carry some products
      at all.
    - The supply level sets that city's shelf size, how fast it restocks, and its price:
      scarce product costs more, plentiful product less.
    - Supply moves over the round. A shipment lands, a connection gets picked up, and a
      product that was plentiful yesterday can be out today.
    - It is safer than the high market, with a smaller margin, but you can still drive a
      long way to find the shelf empty.
  - **The high market** is shared by everyone in the round, one per city per product.
    - It is wholesale: big volumes and live prices.
    - Every player's buying and selling moves the price, and it drifts back toward the
      city's baseline over time.
    - This is where runs make or lose real money. Arriving first matters.
- **Convoys are a 0.5.0 slice (decided).** This is the one exception to same-city combat.
  - Runs are on the road you can see: a progress bar from city to city, leaving and coming
    back.
  - A run can be hit where it is close to a city: in town, leaving it, or coming into it.
    Attackers can follow a run only so far out of town and only so far into town. The open
    road in the middle is police country only.
  - Rival runs in the same city at the same time can hit each other.
  - **Runs drive real roads.** Cities are joined by the interstates that join them in real
    life, so a long run drives through other cities on the way. Every town a run passes
    through is a place its locals can hit it.
  - **Home backs its own.** The closer a run is to its home city, the more of its home crew
    comes to help without being asked.
  - **Owners can send help.** A hit is not instant. The owner is alerted, and if they are
    on, they can send backup before it lands.
- **One Heat number, city thresholds (decided).**
  - Heat stays one number per player, and it goes wherever you go: on a move and on a run.
  - Each city sets what that number means: where the take starts to drag, where **busts**
    start, and where an **arrest** starts, plus how hard each one hits.
  - The same Heat that is harmless in Atlanta can be a bust in Beverly Hills.
  - NYC keeps today's 0.4.0 levels (drag from 40, bust from 70), so a round where everyone
    stays home plays as it does now.
- **Players learn a city by going there (decided).** A little guidance, then figure it out.
  - **Anyone can know**, without leaving home: a city's character, its street talk, the roads
    and drive times, and how the police lean, in words ("Heaviest", "busts much sooner than at
    home"). Street talk is always true and never a number: it names what a city has plenty of
    and what it pays well for, so a trip is never wasted, but not by how much, so no route can
    be ruled out from home.
  - **Your crew knows** what it has seen: Pip's prices and supply in a city a run has been to,
    shown with how long ago.
  - **Home** is known in full.
  - The server only sends what the player knows, so the numbers are not in the page to find.
- **Every city at launch (decided). All eight cities are run and relocation destinations
  from the first 0.5.0 round.
- **City data lives in the ruleset.**
  - The `City` table keeps slug, name, order and enabled; the scout, income and crack
    modifiers are dropped from it.
  - Each city's character is a `cities` block in the pinned ruleset.
  - Older rounds keep reading 1.0 everywhere.
- **Runs and moves settle lazily**, like Pip's shelves and the turn clock.
  - A run or a move is worked out from its timestamps whenever it is read.
  - No background worker is needed.
- **Swing on purpose.** Price events and road risk widen the range of outcomes rather than
  raise the average.

## City characters

Each city gets:
- one headline trait;
- per-product street prices and high-market baselines, set as multipliers on Pip's prices;
- per-product supply at Pip's counter there: what it usually has plenty of, what runs low,
  what it does not carry, and how much its supply swings;
- demand, meaning how far its high market pays above the street;
- police pressure (how fast Heat builds there);
- its own Heat levels: drag, bust and arrest thresholds, and how much a bust or an arrest
  takes;
- market depth (how far one sale moves the price).

The numbers come from the 0.5.0-A simulation. The characters come first.

| City | Character | Cheap here | Pays here | Also |
| --- | --- | --- | --- | --- |
| **New York City** | **The Exchange.** The city that never sleeps and never runs dry. | Nothing: every product sits at the base price | Heroin | Deepest high market (a sale moves the price least); three roads out (Detroit, Atlanta, and I-95 to Miami), with Detroit the closest city in the game; Nightclub pays more (from D); average police |
| **Miami Beach** | **The Port.** It comes in by boat. | Cocaine | Ecstasy (club scene) | Heavy federal pressure: Heat builds fast on runs here |
| **Seattle** | **Rain and green.** Quiet, patient, far away. | Weed, and ecstasy down from Canada | Little: demand is low | Heat builds slowest; the end of the line: two roads in (from Detroit and from LA), none through |
| **Detroit** | **Motor City.** Hard streets, cheap muscle. | Crack | Heroin | Cheaper thugs and guns and cheaper Low-Riders at Charlie's (from D); the gate west from NYC, so the northern and central routes pass through it; convoys here face the toughest locals |
| **Beverly Hills** | **Old money.** The richest buyers on the coast. | Nothing | Cocaine (the most of anywhere) | Thin high market (prices swing hard); Heat builds fastest; the only way in is through LA |
| **Las Vegas** | **The Strip.** Fast money, and it moves fast. | Nothing | Ecstasy and Cocaine | Price events hit most often: the swing city; sits on I-15, so the central route to LA passes through it |
| **Los Angeles** | **The Valley.** Big, crowded, and it cooks. | Meth | Weed | Busy high market (many runs, prices move with traffic); the West Coast junction (I-5, I-10, I-15) and the gate to Beverly Hills |
| **Atlanta** | **The Crossroads.** Three interstates meet here, and the police look the other way. | Heroin | Meth | Lowest police pressure, the safe city to cool off in; I-75, I-85 and I-20 meet here, so half the South drives through: a hijacker's town |

Heat levels in rough terms, before the simulation sets them:

| City | Police | Busts start | Arrests start |
| --- | --- | --- | --- |
| New York City | Average | 70 (as in 0.4.0) | High |
| Miami Beach | Heavy (federal) | Low | Medium |
| Seattle | Light | High | Very high |
| Detroit | Stretched thin | High | High, but a bust takes more |
| Beverly Hills | Heaviest | Lowest | Lowest |
| Las Vegas | Looks away, then doesn't | High | Low: a small gap between bust and arrest |
| Los Angeles | Average | Average | Average |
| Atlanta | Lightest | Highest | Highest |

Pip's supply in rough terms, before the simulation sets it (**+** plentiful, **=** normal,
**-** usually low, **x** not carried):

| City | Crack | Weed | Ecstasy | Cocaine | Meth | Heroin | Swings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| New York City | = | = | = | = | = | = | Least: never below low |
| Miami Beach | = | - | = | + | - | - | Big: shipments come and go by boat |
| Seattle | - | + | + | - | = | x | Little |
| Detroit | + | = | - | - | = | = | Medium |
| Beverly Hills | x | = | = | - | x | - | Medium: it buys more than it sells |
| Las Vegas | = | = | - | - | = | = | Most: the swing city |
| Los Angeles | = | = | = | = | + | - | Medium |
| Atlanta | = | = | - | = | - | + | Medium |

NYC suits the starting city:
- A first run to Detroit is the shortest drive in the game, so there is less time on the
  road.
- Its deep market forgives a newcomer's mistakes.
- Every product is on its street counter, and NYC's supply is the steadiest in the game:
  it never goes below low. The city never runs dry.

It has no cheap product, so a player who only ever trades inside NYC earns nothing from
travel. Heroin is its one demand, a nod to the city's history.

These characters also decide where to relocate. Detroit is cheap to build a crew in,
Atlanta is quiet, and Beverly Hills pays best but is watched hardest. The roads matter
too: living in Atlanta, Detroit or LA means runs drive past your door.

## Roads

Cities are joined by real interstates. A run follows the roads, so going far means
driving through other cities.

```
SEATTLE ------- I-94 / I-90 ------- DETROIT --- I-80 ---- NEW YORK
   |                                |     |               |       |
   | I-5                  I-80/I-15 |     | I-75          | I-85  | I-95
   |                                |     |               |       |
LOS ANGELES -- I-15 --- LAS VEGAS --+     ATLANTA --------+       |
   |    |                                  |    |                 |
   |    +----------- I-20 / I-10 ----------+    | I-75            |
   |                                            |                 |
BEVERLY HILLS                              MIAMI BEACH -----------+
```

| Road | Real route | Drive | Notes |
| --- | --- | --- | --- |
| NYC - Detroit | I-80 / I-75 | ~10h | The shortest run from NYC |
| NYC - Atlanta | I-85 | ~13h | |
| NYC - Miami Beach | I-95 | ~19h | Direct, no towns, but the East Coast's drug corridor: the most police of any road |
| Detroit - Atlanta | I-75 | ~11h | |
| Atlanta - Miami Beach | I-75 | ~10h | |
| Detroit - Seattle | I-94 / I-90 | ~33h | The northern route |
| Detroit - Las Vegas | I-80 / I-15 | ~29h | The central route |
| Atlanta - Los Angeles | I-20 / I-10 | ~31h | The southern route, along the border: heavy police |
| Las Vegas - Los Angeles | I-15 | ~4h | |
| Los Angeles - Seattle | I-5 | ~17h | |
| Los Angeles - Beverly Hills | local | ~0.5h | The only road into Beverly Hills |

- **Game time** is drive hours times a `travelTimeScale` in the ruleset, set by the A
  simulation. At five minutes a drive hour, NYC to Detroit is under an hour and NYC to
  Beverly Hills is about three and a half.
- **Choosing a route.** When there is more than one way, the run screen offers each with
  its time, the towns it passes through and its police. For example:
  - **NYC to Miami:** I-95 is faster and passes no towns, but it is the most policed road.
    Going through Atlanta takes longer and passes Atlanta's locals, with lighter police.
  - **NYC to Beverly Hills:** the southern route passes Atlanta and LA; the central route
    passes Detroit, Las Vegas and LA. Every way in passes LA.
- **Chokepoints** are part of each city's character: Detroit is the gate west from NYC,
  Atlanta is the crossroads of the South, and LA stands in front of Beverly Hills.
- **Each road has its own police level** for road stops (C), on top of the Heat rules of
  the cities at each end.

## Stages and gates

| Stage | Deliverable | Gate |
| --- | --- | --- |
| **0.5.0-A - Cities** | `cities` in the ruleset (characters, prices, supply, routes, pressure, depth, Heat levels); city modifiers move out of the database; all cities enabled; Cities page with each city's character and street prices; trade simulation. | A 0.5.0-A round plays exactly like 0.4.0-E. The simulation shows every city has a reason to go, and no route beats working the street at its best. |
| **0.5.0-B - Runs** | Runs with their own cash and cargo, Low-Rider capacity, route times, turn cost, trading windows, driving on to another city, Pip's counter in every city at its baseline supply; road progress bars; Travel page with price board; run receipts. | Cash, cargo and product are conserved in integer cents. A run can never spend more than it carries, its preview matches its receipt, and it settles the same however often it is read. |
| **0.5.0-C - High market & risk** | Shared high market per city and product, with price impact and recovery; supply swings at Pip's counters; price events; road stops; Heat from runs; arrests. | Buying and selling in the same market always loses; one player cannot pump a price and cash it out; the run outcome range is wide but its expected value holds. |
| **0.5.0-D - Relocation** | Moving home for a fee and downtime; the whole operation moves; local rank, targets and feeds follow. | A move conserves everything the player owns, cannot be used to escape a fight in progress, and cannot be repeated inside its cooldown. |
| **0.5.0-E - Convoys** | Runs near a city (leaving, in town, arriving) can be tailed and hit, including by rival runs in the same town; a warning window before the hit; automatic home backup that grows near the run's home; backup the owner or their allies send if they are on; CONVOY supply policy; cash and cargo loot; admin void. | Hijack win rate stays in band with and without backup; a run near its home is hard to take but not untouchable; a hit always lands or fails when its window closes, whoever is online; linked or allied accounts cannot use a hijack to move goods between each other. |
| **0.5.0-F - Release** | Balance across all eight cities, full-round simulation with runs and moves, UI and phone pass, release regression. | Mixed play (street, Produce and runs) beats pure runner and pure street; the 0.4.0-E release gate still passes. |

## 0.5.0-A - Cities

- **Ruleset:** a `cities` block keyed by slug. Each entry holds:
  - name, blurb and headline trait;
  - street `buy` and `sell` multipliers per product, and high-market baseline and demand
    per product;
  - `supply` per product: its usual level (or not carried), how far it can swing, and the
    shelf size, restock rate and price lean for each level;
  - `policePressure` (Heat per unit sold, and road-stop odds);
  - `marketDepth` (how many units move the price 1%);
  - `heat`: the city's drag, bust and arrest thresholds and their penalties, which replace
    the round-wide 0.4.0 levels;
  - district pay and store price tweaks, such as NYC's Nightclub and Detroit's cheap guns.
    These are data in A and apply to players living there from D, when anyone can;
  - the scout, income and crack modifiers that used to live on `City`.
- **Roads:** the road graph in the ruleset. Each road has its two cities, its real drive
  hours and its police level, plus `gameMinutesPerDriveHour` and `turnsPerDriveHour`,
  which turn drive hours into game time and turns.
  - Routes are found on the graph: the shortest, plus any other way that is no more than a
    set share longer, so there is a choice.
  - A city's zone reach says how far out along each road its locals can follow a run.
- **Migration:**
  - drop the three modifier columns from `City`;
  - the engine's `CityModifiers` come from the ruleset;
  - rulesets before 0.5.0-A return 1.0.
- **Heat reads the city.** Drag and bust come from your home city's levels. NYC's levels
  are the 0.4.0 ones, so A changes nothing in play. Arrests arrive in C.
- **Seed:** all eight cities are enabled, and `startingCitySlug` stays `new-york-city`.
- **Cities page:**
  - each city's character and street talk, the police and when busts start against home, in
    words;
  - Pip's counter only at home;
  - the roads out of it and the drive time from home;
  - no trading yet.
- **Simulation (`qa:travel`):**
  - for each route (including the ones through other towns) and product, compare cost
    against sale at street and high-market baselines, with time and turns counted against
    a street-work baseline;
  - flag any city with no profitable route and any route that beats the best street work.

Built: the `classic-og-v0.5-a` ruleset (0.4.0-E balance plus `cities` and `travel`), the
engine's city, counter, high-market and route helpers with `cityRulesetProblems`, the
`CityModifiers` read from the ruleset, Heat localized to the player's home city
(`rulesetForCity`), the migration dropping the modifier columns, all eight cities
enabled in the seed, `GET /api/game/cities`, the Cities page (road map, city picker, a
city's character, street talk, police and roads, and Pip's counter at home), and
`npm run qa:travel` in the release gate. `cityRulesetProblems` also checks that street talk
names every product a city has plenty of or pays well for, and never gives a number. See [TRAVEL-SIMULATION-0.5.0-A.md](TRAVEL-SIMULATION-0.5.0-A.md).

What the simulation settled:
- **Runs are measured in net worth per turn**, the number rankings use. Street work counts
  its cash at the 75% cash weight plus the whores and thugs it recruits; a run counts its
  profit at the cash weight.
- **750 units per Low-Rider, a turn per two drive hours, five game minutes per drive
  hour, a 5% high-market cut, and deep markets** (New York 1,200 units per 1%, Beverly
  Hills 160). With these, a mid-round crew's best run earns about two-thirds of the street
  at its best, a late-round crew's about a third, and every city's best run earns at least
  a fifth. No crew's best run beats the street.
- **The high market is for bulk, never a discount.** Buyers pay the higher of Pip's price
  and the demand price, plus the cut. Without that, buying wholesale at home would undercut
  Pip's counter.
- **A city cannot be cheap and pay for the same product.** `demand` stays under Pip's
  cheapest price there over the seller's share, so buying and selling in one city always
  loses. That moved Detroit's "pays here" from crack to heroin.
- **Seattle was too far to matter** on weed alone, so it also gets cheap ecstasy from over
  the Canadian border.

## 0.5.0-B - Runs

- **Run** `(roundPlayerId, homeCity, cashCents, lowRiders, escortThugs, stops, state)`, with
  cargo in rows per product and one row per stop `(city, arriveAt, leaveAt)`.
  - One active run per player at first.
- **Loading up:**
  - Launching a run costs turns.
  - You choose the cars, escorts, cash and product to take. They all leave your home stock
    in the same locked transaction.
- **Capacity:** `cargoPerLowRider` in the ruleset. The cars are the cap, which finally
  gives Charlie's lot a purpose. Cash takes no space.
- **The run's wallet:**
  - Buying in town spends the run's cash, and selling adds to it.
  - A purchase is refused if the run's cash cannot cover it or the trunk is full.
  - Your home cash is never touched. Home stores keep using home cash as usual.
- **Timeline:**
  - on the road, then in town for a trading window;
  - then either on to the next city or on the road home;
  - then back, when everything the run holds merges into home stock and a receipt lands.
  - When a window closes with no choice made, the run heads home.
- **Pip's counter in every city:**
  - A run in town trades at that city's counter from its own wallet and trunk.
  - Your shelf in each city is your own, sized and restocked by that city's supply level,
    and settled lazily like Pip's shelves today. A product the city does not carry is not
    on the counter at all.
  - In B, every city sits at its usual supply level. Swings arrive in C.
  - NYC's counter is Pip's store at home, so a player who never leaves NYC sees the same
    store as before.
- **The route:** a run is launched on a route from the road graph. It is a chain of roads,
  and it can pass through towns it does not stop in.
  - **Passing through** a town takes a short time on its streets. There is no trading
    window, because the run does not stop.
  - Any town on the route can be made a stop instead, which gives it a trading window.
- **The road:** every road on the route has a position from 0% to 100%, worked out from
  its start and arrival times.
  - The first and last stretch of each road are **city zones**, where the run is still
    close to the city behind it or getting close to the one ahead. That is true of towns it
    only passes through, too. How far each zone reaches is set per city in the ruleset.
  - The middle of each road is the **open road**.
  - Zones do nothing in B. Convoys (E) use them.
- **Home while away:**
  - escort thugs are not home, so they do not defend, cover the street or cook;
  - the Low-Riders are not home either, so they cannot drive-by;
  - the run's cash and cargo cannot be raided at home. They can be hit on a convoy (E).
- **Net worth:** a run's cash, cars and cargo stay yours and count toward net worth, with
  cargo valued at the home buyback price like home stock.
- **Travel page (the price board):**
  - Pip's prices and supply for the cities your runs have seen, with how long ago, and street
    talk for the rest;
  - your run as a **progress bar**: the whole route with every town on it, the road it is
    on, where it is along it, the city zones shaded around each town, and the time to the
    next one;
  - a route picker when launching, showing each way's time, the towns it passes and its
    police;
  - its wallet and trunk;
  - buy, sell, drive on or head home while in town;
  - a receipt when it is back.
- **Phone:** Travel is a tab candidate, with a badge while a run is in town and waiting on
  you.

Built: the `classic-og-v0.5-b` ruleset (0.5.0-A balance plus `travel.runs`, a 120-minute
town window), the `Run`, `RunStop`, `RunCargo`, `RunTrade`, `CityShelf` and `CitySighting`
tables with non-negative checks, `RoundPlayer.awayNetWorthCents`, the engine's run planning
(`planLaunch`, `planDriveOn`, `planHeadHome`, `runPosition`), city trades and shelves, the
launch, trade, drive-on and head-home actions on the action pipeline, a run settle that
every action and every read runs first, the Travel page (which replaces the Cities page:
`/game/cities` redirects), the Travel nav badge, a dashboard line while a run is out, and a
`TRAVEL_INTEGRATION` suite in the release gate.

How it settled:
- **Turns.** A launch pays for the drive out and the drive home. Driving on pays for the new
  legs less the drive home already paid, and never refunds; heading home early refunds
  nothing. The route preview uses the same sum, and the suite checks they match.
- **Stopping in a town on the way** is a run to that town, then a drive on from it.
- **What the crew saw** is recorded while a run sits in a town and after every trade there,
  with the time. The map shows it as last seen, stock included.
- **Escorts leave their guns at home.** In B they only take up seats and stay out of home
  defense, cover and cooking. Whether escorts carry weapons is decided with convoys (E).
- **City zones** are ruleset data only. The progress bar shows the leg and the road the run
  is on; shading zones waits for E, where they matter.
- **One run at a time.** A run left alone waits out its window and comes home with what it
  has; nothing is sold for you.

## 0.5.0-C - High market & risk

- **High market:**
  - One row per round, city and product: current price, last update and baseline.
  - A sale lowers the price and a purchase raises it, scaled by the city's depth.
  - The price drifts back to baseline over time, settled lazily and read under a row lock
    so concurrent runs cannot both sell at the old price.
  - A trade can quote a price and refuse if the price moved beyond a set tolerance before
    it lands.
  - High-market trades use the run's wallet like the street counter does.
- **Supply swings at Pip's counters:**
  - Each city's supply for each product moves between levels on a per-round schedule,
    seeded so rounds differ and the admin can replay them. How far and how often it moves
    is the city's swing: NYC barely moves, Las Vegas moves most.
  - A level change resizes every player's shelf in that city and moves its price. Dropping
    to **out** empties the shelf until supply comes back.
  - The high market leans the same way: when Pip is out in a city, its high-market price for
    that product climbs.
- **Knowing prices and supply:**
  - Pip's supply and prices, and high-market prices, are live for the city your run is in;
  - elsewhere you see what you last saw, with its age ("Miami cocaine: plentiful, 5 hours
    ago"), or only the street talk if you have never been;
  - the wire carries some news for free ("A boat came in at Miami"), not all of it.
- **Price events:**
  - a per-round seeded schedule, replayable from the round id like supply swings;
  - bigger and rarer than a supply swing: for example, "Coke glut in Miami: baseline -40%
    for 6h" or "Vegas bust: ecstasy doubled, Pip out";
  - they are announced on the wire, and Vegas rolls them most often.
- **Heat from runs:**
  - it is the same single Heat number: selling in a city raises it by that city's police
    pressure;
  - while a run is in town, that city's levels decide whether a trade risks a bust or an
    arrest;
  - Heat cools on the same clock wherever you are.
- **Arrests:**
  - a new tier above busts, set per city;
  - at home, an arrest costs a larger seizure and fine than a bust, plus **downtime**: hours
    locked up in which you cannot act, like a move. Heat drops more than a bust drops it;
  - on a run, an arrest seizes the whole trunk and part of the run's cash, and the run
    heads home.
  - The dashboard Heat panel, the status bar and the nav badge show the city's drag, bust
    and arrest state; Scout/Produce receipts show an arrest, seizure, fine and lockup.
- **Road stops:**
  - the chance rises with cargo size, Heat and the road's police level (I-95 and I-10 are
    the worst), and escorts reduce it;
  - a stop seizes part of the cargo and fines part of the run's cash, like a bust.

Built: the `classic-og-v0.5-c` ruleset, the shared `HighMarket` row and row lock,
seeded Pip supply swings and gluts/droughts, shelf settlement across supply boundaries,
high-market quote tolerance and price recovery, street-wire market news, sale Heat,
once-per-leg road stops, home and run arrests, run incident receipts, and the Travel
page's high-market trading/incident UI. `TRAVEL_INTEGRATION` covers shared prices,
stale quotes, same-market loss, road-stop idempotence, run arrests, home arrest downtime
and unknown-city information hiding. `qa:travel` runs both the original route gate and
the C risk/pump gate. See [TRAVEL-SIMULATION-0.5.0-C.md](TRAVEL-SIMULATION-0.5.0-C.md).

How it settled:
- **The high market is actually shared.** A trade locks one round/city/product row; the
  next trader sees the moved price. A pushed price has a 90-minute recovery half-life,
  and a quote is rejected once the first unit moved more than 2% against the player.
- **Pip moves on a seeded clock.** Supply rolls in four-hour slots; larger gluts and
  droughts roll in half-day slots and last six hours. The street wire exposes some of
  those changes without leaking future prices.
- **Risk is swing, not a new income source.** The gate rejects market pump-and-cash-out
  loops, any average run that beats street work, an expected value too far from the
  planned route, or a best route whose 10th-to-90th percentile is too narrow.
- **Police risk follows the load.** Road-stop odds rise with road police, cargo and Heat;
  escorts cut the odds. A stop takes 25% of each product in the trunk and 10% of run
  cash under the base C rules.
- **Arrest sits above bust.** NYC's base arrest line is 90 Heat. A home arrest takes a
  larger product/cash share, drops more Heat and locks actions for two hours; a run
  arrest takes the trunk and part of its wallet and sends the cars home. Each city's
  own Heat thresholds still override the base through its city rules.

## 0.5.0-D - Relocation

- **What moves:** everything. `RoundPlayer.cityId` changes, so the stable, stock, cars,
  Heat and hideout all go with it.
  - Local rank, the raid target list, recon and the Discord city feed follow `cityId`
    without changes.
  - Alliances span cities and are unaffected.
- **Fee:** priced on net worth with a floor, like the Heat bribe. Moving must cost enough
  that it is a decision, not a habit.
- **Downtime:** a fixed number of hours on the road.
  - You cannot Scout, Produce, trade, raid or launch a run.
  - Turns keep accruing up to the cap.
  - **You stay a target in the old city** until you arrive. The truck is still being
    loaded, so a move cannot be used to dodge a raid.
- **Limits:**
  - no move while a run is out or a fight is in progress;
  - a cooldown between moves;
  - an optional end-of-round cutoff, so nobody moves in the last hours to reshuffle local
    ranks.
- **Heat follows you. The rules change on arrival.**
  - The number comes with you, but the new city's police pressure and levels apply the
    moment you arrive.
  - Moving to Atlanta lets you live with Heat that would bust you in NYC. Moving to Beverly
    Hills with high Heat can put you over its arrest level on day one.
  - The move screen shows what your Heat will mean in the new city before you pay.
- **Hideout:** built levels move with you. The fee is what pays for moving them.

Built: the `classic-og-v0.5-d` ruleset (`travel.relocation`: 5% of net worth with a
$25,000 floor, six hours on the road, a 24-hour cooldown, no moves in the round's last 24
hours), the `Relocation` table (one move on the road at a time, enforced by a partial
unique index) and `RoundPlayer.movingUntil`, the move action on the action pipeline, the
move panel on the Travel page with every city's Heat lines against yours, a dashboard line
and a Travel badge while the truck is on the road, and a `TRAVEL_INTEGRATION` relocation
suite.

How it settled:
- **Arrival is lazy.** `cityId` changes when the truck arrives: the mover's own settle
  brings them in, and every city-wide list (targets, the rankings page, the Discord city
  feed, the final standings) first brings in anyone due, skipping rows another transaction
  holds so it never waits or deadlocks. A stored local rank can lag one arrival until that
  player next acts.
- **A fight in progress** is a revenge window: combat resolves instantly, so the escape a
  move could offer is hitting someone and leaving before they can hit back. A move is
  refused while anyone the player attacked can still take revenge. The one who was hit can
  always move.
- **Nothing moves on the road or in a cell.** The action pipeline refuses every action
  while the truck is out, as it does while locked up. Combat takes its own locks, so raids,
  drive-bys, special raids, recon and treatment now check both too; before D, a player
  locked up after an arrest could still raid.
- **Living in a city.** With `travel.relocation`, `rulesetForCity` also applies the city's
  district pay and store prices, and puts Pip's home counter at the city's price and usual
  supply (his shelf there, none where he does not deal it: Beverly Hills has no crack or
  meth on the shelf). What any store or Pip pays back stays at base, so buying never raises
  net worth and cooking to sell never pays in any city; a unit test checks every city.
  New York is unchanged but for its Nightclub (+10%), which no crew picks over the Casino
  District, so a New York round plays as it did.
- **Where to live** is a report in `npm run qa:travel`, not a gate: Beverly Hills' Casino
  District pays big crews 20% more and Las Vegas 15%, and both pay for it in Heat lines and
  Pip's prices.

## 0.5.0-E - Convoys

- **Where a run can be hit:** only near a city, never on the open road. That includes
  every town on its route, not just where it stops. Near each town there are three places:
  - **Leaving town:** in the city zone at the start of a leg. Locals can follow it out, but
    only as far as their city's zone reaches.
  - **In town:** during a trading window, or while driving through.
  - **Coming into town:** in the city zone at the end of a leg. Locals can meet it on the
    way in.
- **Who can hit it:**
  - players who live in that city, including towns the run only drives through. A run from
    NYC to Beverly Hills on the central route has to get past Detroit, Las Vegas and LA;
  - **rival runs** in that city's town or zones at the same time. This gives convoys
    targets from the first day, while everyone still lives in NYC.
- **Convoys near you:** a list on Travel of every run you can reach right now, and every
  run whose route passes your town, each with its progress bar and when it will be in
  reach. A run on its way is a chance you can see coming; a run leaving is one that is
  about to get away. You see a run's route through your town, not its final destination.
- **Recon on a convoy:** it shows cash band, cargo size and escort strength, not exact
  contents.
- **Tail, then hit:**
  - Hitting a convoy starts a **tail**: your squad is committed, and the hit lands when a
    short warning window closes.
  - The target must still be in reach when the window closes. A run that leaves the zone
    first gets away, and your squad comes home having spent its turns.
  - One tail on a run at a time.
- **Home backs its own (automatic):**
  - The closer a run is to its home city, the more of its home crew rides out to help: a
    share of the owner's fit, armed thugs at home, rising from none at the edge of the home
    zone to the most in the home town.
  - It happens whether or not the owner is on, so hitting a run just outside its owner's
    city means fighting part of their crew.
  - A run far from home only has its escorts, unless someone sends help.
- **Sending help (live):**
  - When a tail starts, the owner gets a push and an alert showing who, where, and the time
    left.
  - If they are on, they can **send backup** from home: fit thugs who ride out and join the
    escorts, if the run is close enough to home for them to get there before the hit.
  - They can also **call allies** who live in the city the run is near. Allies who answer
    in time send thugs of their own. This is the first time alliance members fight for
    each other in real time.
  - Backup that arrives counts in the fight and comes home after it, win or lose. It takes
    wounds like any defender.
  - An owner who is not on is not punished for it: the automatic home backup still rides.
- **The fight:**
  - it reuses the raid engine, with escorts, home backup and sent backup as defenders;
  - it uses product combat effects from a new **CONVOY** supply job;
  - a Low-Rider carries its `thugsPerLowRider` escorts, as on a drive-by.
- **Loot:**
  - a share of the run's cash, and a share of its cargo split across products by largest
    remainder, as with raid loot;
  - a chance at a Low-Rider when the whole escort goes down, as with drive-by rules.
- **Guards:**
  - no hitting an ally's convoy;
  - a run that was just hit cannot be tailed again for a while;
  - a tail always settles when its window closes, whoever is online, so neither side can
    stall it;
  - loot caps per convoy;
  - linked-account signals in admin, because a hijack is a way to move goods between
    players;
  - admin void, like battles.
- **The owner is alerted** by push and activity when a tail starts and when it lands.

Built: the `classic-og-v0.5-e` ruleset (`travel.convoys`: an eight-minute window, eight
turns a tail, two turns a recon that stays good for twenty minutes, two hours before a run
can be hit again, half the fit crew at home riding out in the home town, the road's own
strength roll, and cash and cargo loot capped by what the squad carries), `ConvoyTail`,
`ConvoyBackup` and `ConvoyRecon`, one tail waiting per run and one squad out per attacker,
`RoundPlayer.busyThugs`, the escorts' guns and `woundedEscorts` on `Run`, the CONVOY
supply job, the recon, tail, backup and call-allies actions, the Convoys panel on Travel,
an admin void and convoy hits in Signals, `runConvoySimulation` in `npm run qa:travel`, and
a `TRAVEL_INTEGRATION` convoy suite.

How it settled (with the design changes made while building it):
- **No convoy alerts.** Nobody is pushed or badged when a tail starts. A crew **recons its
  area** for turns: every run coming near, in town or leaving where it lives, and near its
  own run where that is, as far ahead as it can see. It is a snapshot that goes stale, with
  the runs' wallets, trunks and escorts in bands as they were, and only a run it found can
  be tailed.
- **Lookouts give a small heads-up**, to both sides. An owner sees a tail on their run only
  in its last minutes: 0.8 a Lookouts level, four at the top of an eight-minute window, none
  without lookouts (they find out when it lands). A recon sees ten minutes ahead, plus four a
  level. Only once they see it can an owner send backup from home or call allies who live
  there; allies see the call on their Travel page, and nothing is pushed.
- **Escorts always ride armed.** A launch hands each escort one gun from home, the best
  first, as far as the arsenal goes; the guns count in the run's net worth and come home
  with it. A bust or an arrest on the run takes every one of them. Escorts fight with the
  guns they carry; the crew riding out from home takes the best of the home arsenal. Guns
  are never looted in a convoy hit.
- **Nobody holds two locks.** Starting a tail commits the squad under the attacker's lock:
  its thugs stay theirs and count for net worth but are busy, not fit. Backup rides out the
  same way under its sender's lock. The hit lands in the run's settle under the owner's lock
  alone, and each other side's share (the squad and its haul, an ally's thugs, their
  wounds) reaches them at their next settle. Two runs tailing each other cannot deadlock.
- **A tail lands whoever is online.** Any read by the attacker, the owner or someone who
  sent backup lands a due tail first, and the alerts poller sweeps every due tail each
  minute.
- **Order on the road.** A run's settle rolls its police stops first, then lands its tails,
  then brings it home, so a stop sees the trunk as it drove and a run that got home before
  the hit got away.
- **The fight** is the raid engine with the road's own roll: an ambush takes the defender's
  1.1 edge away and the variance goes from 10% to 30%, because raids' near-certain outcomes
  made a run at home untouchable and an even fight a sure thing for the defender. Raids
  are unchanged.
- **Linked accounts** are refused at the tail: two accounts seen on the same real network
  in the signal window cannot hit each other's runs. Any hit that landed before the link
  showed is listed in Signals with a void button.
- **Rival runs** hit with their fit escorts and the guns those escorts carry, and their haul
  goes into their own trunk, as far as it holds. They burn no fight supply.

## 0.5.0-F - Release

- **Balance:** a pass per city on the `qa:travel` and full-round runs, including the
  relocation fee, downtime and cooldown.
- **Full-round simulation:** street-only, runner-only, mover, hijacker and mixed
  strategies across all eight cities.
- **UI:** a phone pass on Travel, the price board and the move screen; the Rules page gains
  a Travel panel.
- **Release regression:** travel integration suites join `qa:release`.

## Open questions

1. **Warning window length.** Long enough for an owner who is on to answer, short enough
   that a tail is worth starting. Minutes, not hours; set in the E simulation.
2. **More than one run at a time.** One at first; a hideout room (a garage) could raise the
   limit later.
3. **Relocation downtime and cooldown.** Set in the A simulation, but roughly "a night on the
   road" and "once a day at most".
4. **Cross-city raids.** Still out: convoys are the only exception.

## Not in 0.5.0

- **Turf in several cities.** Crews in more than one city at once is 0.6.0 or later.
- **Wiring money to a run.** A run has only what it took, by design.
- **Player-to-player trade.** It is still the multi-account feeding route, and the high
  market stays NPC-backed.
