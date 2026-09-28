# Brainstorm - Trips: the boss travels

Status: **Stage A built; the rest is still a brainstorm.** It is a starting point for a roadmap that
sits between the built 0.5.0/0.6.0 travel and the 1.2 Casino expansion
([ROADMAP-FUTURE.md](ROADMAP-FUTURE.md)).

## Decided

- **Home while away: the lieutenant runs it** (option B in section 6). Home actions keep
  working, at a boss-away cut, a small home-defense penalty and slow happiness drift.
- **Flying stays in.** A trip can fly (fast, no guns, carry-on cash cap, airport Heat check)
  or drive (road graph, guns ride along, can be hit like a convoy).
- **Trips ship before the Casino update.** Trips A-D stand on their own, with in-person
  Jobs, sit-downs, the local gun connect and outpost visits as their first uses. 1.2 Casino
  then plugs into presence instead of inventing its own way to get to Vegas.

Everything else below is still a proposal.

## The gap

Today there are two ways to leave home, and neither is **you**:

- **A run** is a crew on the road, not the player. It hauls cash and product, trades at
  Pip's counters and high markets, services outposts and comes home. The operation at home
  keeps working.
- **Relocation** moves everything: stable, stock, cars, Heat, hideout. It costs 5% of net
  worth, six hours on the road and a 24-hour cooldown.

The 1.2 Casino update wants Las Vegas to be a place you **go**: sit at a high-roller table,
get comped a suite, meet a contact who only deals face to face. A run cannot do that (it is
not you), and relocating to Vegas for one night at the tables is the wrong tool. The
missing piece is a third mode:

- **A trip.** The boss goes to another city for a stay, alone or with a small entourage of
  armed thugs, does things that need them there in person, and comes home. Home stays home.

## Core idea

`RoundPlayer.cityId` stays **home**. A trip adds a second, temporary city: **where the boss
is**. Everything city-scoped today keeps reading home unless a feature explicitly asks
"where are you standing?".

```
               home (cityId)                     presence (trip city)
  +-----------------------------------+    +------------------------------+
  | stable, stock, hideout, turf,     |    | the boss, the bankroll,      |
  | home defense, local rank, Pip's   |    | the entourage and its guns,  |
  | home counter, district pay        |    | casino tables, local jobs,   |
  +-----------------------------------+    | sit-downs, being hunted      |
                                           +------------------------------+
```

## Proposed decisions

### 1. Three ways to travel, one per job

| | Run (built) | **Trip (new)** | Relocation (built) |
| --- | --- | --- | --- |
| Who goes | a crew in Low-Riders | **the boss** (+ entourage) | everyone and everything |
| Carries | cash, product, beer, escorts, guns | **a bankroll**, entourage, their guns | the whole operation |
| Trades product | yes | **no** (that is a run's job) | n/a |
| Home keeps working | yes | **yes, with a boss-away cost** | no, six hours of downtime |
| Comes back | yes | **yes** | no |

A trip never carries product. That keeps it from becoming a better run.

### 2. Getting there: fly or drive (decided: both)

This is the interesting choice, and it maps straight onto "just myself" vs "with my thugs".

- **Fly.**
  - Fast: a fixed short time between any two cities (say 45 game minutes plus airport
    time), no roads, no convoy zones, no road stops.
  - **No guns on a plane.** An entourage can fly, but it lands unarmed. It has to arm up
    locally (see Tommy's connect, below) or stay unarmed.
  - **Cash limit.** Carry-on money is capped (a flat cap, or a share of net worth). Over the
    cap, the airport can flag you: a seizure roll scaled by Heat.
  - **Airport Heat check.** High Heat raises the odds of being pulled aside on departure or
    arrival, which costs time and a fine. Very high Heat can refuse the flight outright.
  - Costs a ticket per head, so a big entourage by air is expensive.
  - The natural pick for **going alone**.
- **Drive.**
  - Uses the existing road graph and route picker. Same drive times as a run
    (NYC to Las Vegas via Detroit is ~39 drive hours, a few hours of game time).
  - Guns come with you, like run escorts: one gun per thug from home, best first.
  - Seats are Low-Riders: `thugsPerLowRider` per car, so the cars cap the entourage.
  - **The car is visible.** It drives through city zones and can be recon'd and tailed like
    a convoy, with the boss in it. It can be pulled over on the road like a run.
  - The natural pick for **rolling deep**.

### 3. Entourage tiers

Rather than a free slider, three named tiers make the choice legible and give balance fixed
points to tune:

| Tier | Thugs | Feel | Trade-off |
| --- | --- | --- | --- |
| **Solo** | 0 | low profile | cheapest, fastest, hardest to spot (smaller recon footprint); defenseless if someone does find you |
| **Crew** | up to ~5 | a couple of cars | can hold off a mugging or a small hit; visible |
| **Entourage** | up to a cap (e.g. 20, or 2% of thugs) | a statement | needed for high-roller tables and sit-downs that want respect; biggest target, and those thugs are not defending home |

The cap matters: anything bigger than an entourage is a run with escorts or a relocation.

### 4. The bankroll (a wallet, like a run)

- A trip takes a **bankroll** out of home cash. That is all the boss has in town.
- No wiring from home, same rule as runs. Running dry in Vegas means going home.
- Everything the trip holds merges back into home when it returns.
- Casino losses leave the economy (the 1.2 guardrail): the bankroll is the natural place
  where that sink happens.
- Possible later: a **marker** (casino credit line) from a contact, repaid from home cash on
  return, with interest and consequences for skipping out.

### 5. The stay

- A trip has three phases: **traveling there**, **in town**, **traveling home**.
- In town, the boss **checks into a hotel**. The stay has a length chosen at launch (e.g. 2,
  6 or 12 hours), extendable while there, with a hard max.
- The room costs cash per hour from the bankroll. Casino comps can cover it.
- When the stay ends with no choice made, the trip heads home (same default as a run's
  trading window).
- Settled lazily from timestamps, like runs and relocation. No background worker.

### 6. Home while the boss is away (decided: B)

This is the balance heart of the feature. Options, cheapest to harshest:

- **A. Phone it in.** Every home action still works from away. The only cost is the
  entourage and bankroll not being home. Simple, but then there is no reason not to travel.
- **B. The lieutenant runs it (chosen).** Home actions still work, but:
  - Scout and Produce pay a **boss-away cut** (e.g. 10%), the lieutenant skimming.
  - Home defense loses the boss's presence bonus (a small defense modifier, e.g. -5%), on
    top of missing the entourage.
  - Happiness drifts down slowly while the boss is gone ("the girls notice").
  - Store buying at home still works (someone runs errands).
- **C. Away means away.** Home actions are locked like relocation downtime. Too punishing
  for a feature whose point is fun.

Option B keeps the game playable on a phone during a trip, while making a trip a real
decision. The numbers (cut, defense modifier, happiness drift) are set by the stage E
simulation; the ones above are placeholders.

### 7. Where the boss is, the boss can be hit

A boss in another city is a target there. This reuses the convoy tail almost as-is:

- **Who can hit a visiting boss:** players who live in the trip city, and rival bosses on a
  trip in the same city at the same time (Vegas on a busy night).
- **How:** recon the city for visitors, tail, and the hit lands when the warning window
  closes, exactly like a convoy.
- **Defenders:** the entourage with the guns it carries (or none, if it flew in unarmed),
  plus allies who live in that city if the boss calls them.
- **No home backup** unless the trip city is within the home zone. Far from home, the
  entourage is all you have. That is the risk of rolling light.
- **Loot:** a capped share of the bankroll and any casino winnings on hand.
- **Losing** sends the boss home early: the stay ends, wounded thugs come home wounded, and
  the boss is **laid up** for a short lockout (like an arrest's downtime, shorter).
- **Guards:** no hitting allies, linked-account refusal, a re-hit cooldown, a hit always
  settles when its window closes. Same rules convoys already enforce.
- Revenge: a hit on a visiting boss opens a revenge window like a raid.

A solo boss who flew in is the easiest target in the game, but also the hardest to find.
That is the point of the solo tier.

### 8. Heat on a trip

- Heat is still one number, and it travels with the boss.
- While in town, the trip city's thresholds apply to anything the boss does there.
- Las Vegas already has the design "looks away, then doesn't": a small gap between bust and
  arrest. A big casino win with high Heat is where that bites.
- An arrest on a trip seizes part of the bankroll, sends the boss home, and adds lockup
  time. The entourage's guns are taken, like a run arrest.

### 9. Limits and interactions

- **One trip at a time.** A trip does not use a run slot; the Garage still governs runs.
- **No relocation** while a trip is out, and no trip while a move is on the road.
- **Revenge windows:** a trip is refused while anyone you attacked can still take revenge
  (same rule as relocation), so a trip cannot be used to hit and hide.
- **Being hit at home** while away is allowed and normal. The boss being away is the
  opening.
- **Round end:** no new trips in the round's last N hours; trips out when the round ends
  come home at close.
- **Alliances:** allies in the trip city can be called for backup; an alliance could later
  book a shared table or a sit-down together.

## Things a trip unlocks

Presence is the new capability; these are features that consume it. The Casino update is
the first customer, not the only one.

- **Casino (1.2).**
  - Tables, slots and high-roller rooms only open to a boss **in** a casino city.
  - High-roller tables require the **Entourage** tier (respect) and a minimum bankroll.
  - Comps: enough action gets the suite paid for, extends the stay, unlocks a private table.
  - "Whale" status for the stay: bigger tables, but other players' recon lights up when a
    whale is in town.
  - Achievements and seasonal stats: biggest night, longest stay, busted in Vegas.
- **Contacts in person.** A job that says "meet Vic in Miami" or "sit down with the Detroit
  crew" completes only with the boss present. Fits the Jobs & Contacts engine as a new
  current-state objective (`presence in city X`).
- **Local gun connect.** A job-unlocked Tommy contact per city who rents guns to an
  entourage that flew in unarmed. Makes flying with a crew viable, at a price.
- **Outpost inspection.** Visiting an outpost in person raises its tax take or morale for a
  while. Gives outposts a reason to see the boss.
- **Sit-downs.** Two bosses in the same city can meet in person to agree a truce or trade,
  with a neutral-ground rule (no hits during the meeting).
- **Cooling off.** A few quiet hours in Atlanta or Seattle cool Heat faster than at home.
  Needs care: it must not replace the bribe.

## Where this could live in the code

Grounded in what 0.5.0/0.6.0 already built:

- **New `Trip` model**, alongside `Run`, rather than a `kind` flag on `Run`:
  `roundPlayerId, homeCity, destination, mode (FLY | DRIVE), tier, entourageThugs,
  woundedThugs, pistols/shotguns/tek9s/ak47s, bankrollCents, startBankrollCents,
  departedAt, arrivesAt, stayUntil, returnsAt, returnedAt, status`.
  - A run carries product, cargo, trades and stops; a trip carries none of that. Sharing a
    table would fill `Run` with nulls and make every run query think about trips.
  - Driving trips can reuse the run route/leg helpers (`planLaunch`, `runPosition`) and road
    stop rolls, keyed by a trip id instead of a run id.
- **`RoundPlayer.presenceCity`** (nullable; null means home), set on arrival and cleared on
  return by the trip settle, the same lazy pattern as `movingUntil`.
- **Ruleset:** a `travel.trips` block in a new pinned ruleset: flight time, ticket price,
  carry-on cap, tier caps, hotel price per city, boss-away cut and defense modifier, stay
  lengths, lockout on loss, end-of-round cutoff. Older rounds have no `trips` block and
  cannot travel this way.
- **Combat:** a `BossTail` mirroring `ConvoyTail`, reusing the convoy fight (road roll,
  ambush variance) with the entourage as defenders.
- **Action pipeline:** new actions `trip.launch`, `trip.extend`, `trip.headHome`,
  `trip.recon`, `trip.tail`, `trip.callAllies`. Every action settles the trip first, like
  runs.
- **Audit:** everything that reads `cityId` today (targets, local rank, Discord feed,
  district pay, Pip's home counter) should keep reading **home**. Only features that opt in
  read `presenceCity`. That keeps the blast radius small.

## A possible staging

| Stage | Deliverable | Gate |
| --- | --- | --- |
| **A - Presence** | `Trip` and `presenceCity`; solo trips by air; bankroll; hotel stay and head home; boss-away cut; Travel page trip panel. | Bankroll conserved in integer cents; a trip settles the same however often it is read; a round where nobody travels plays unchanged. |
| **B - Entourage** | Crew and Entourage tiers; driving trips on the road graph; guns ride along; flying lands unarmed; airport Heat checks and carry-on cap; road stops. | Thugs and guns conserved; no trip can carry product; flying is never strictly better than driving. |
| **C - Hunted** | Visitor recon, tails and hits on a boss in town; ally call-in; loss sends the boss home laid up; trip arrests. | Hit win rate in band for each tier; a solo boss is hard to find but easy to beat; a hit always settles when its window closes. |
| **D - Hooks** | Presence objectives in Jobs; local gun connect; outpost inspection; sit-downs between bosses. These are the reasons to travel before casinos exist; the 1.2 Casino update builds on this stage. | A presence job cannot be completed without being there; renting guns is never cheaper than bringing them. |
| **E - Release** | Full-round simulation with travelers vs homebodies; phone pass; Rules page Trips panel; regression. | Traveling is a choice, not a requirement: a crew that never takes a trip is not locked out of the top ranks, and the 0.5.0-F and 0.6.0-F gates still pass. |

## Stage A - built

Ruleset `classic-og-trips-a` (0.8.0-H balance plus `travel.trips`; the version label is a
placeholder until trips get a release number).

- **Solo, by air.** 45 minutes each way between any two cities; a $2,500 round-trip ticket;
  stays of 2, 6 or 12 hours, extendable in 2-hour blocks up to 24; a hotel rate of $500 an
  hour with a lean per city (Detroit and Las Vegas 0.6, Beverly Hills 2.0); 5 turns to get
  out the door; carry-on bankroll up to $250,000; no new trips in the round's last 12 hours,
  and no stay that runs past the round's end.
- **Money.** The ticket, the hotel for the whole stay and the bankroll leave home cash at
  launch. The bankroll counts in net worth as cash (inside `awayNetWorthCents`) and comes
  home whole, less any extensions, which it pays for. Checking out early refunds nothing.
- **The lieutenant.** While a trip is out, Scout and Produce takes lose 10% before they
  land. Receipts and the activity feed show the cut. The defense modifier and happiness
  drift from option B are left for the stages where hits on an away boss exist (C).
- **Home stays home.** `cityId` never changes: the boss still ranks, is targeted and works
  at home. No move house while a trip is out (`TRIP_OUT`), and no second trip.
- **Where the boss is** comes from the `BossTrip` row's four timestamps (`departedAt`,
  `arrivesAt`, `stayUntil`, `returnsAt`), not a `presenceCity` column, so it cannot lag.
  A city-wide "who is visiting" list can query `BossTrip` by city directly.
- **Lazy return.** Every action and every settle brings a trip home once `returnsAt`
  has passed, idempotently, like runs.
- **Dropped:** the revenge-window rule. Home stays a target while the boss is away, so a trip
  is no escape from a fight.
- **Code:** `packages/rules-engine/src/calculations/trips.ts`,
  `apps/server/src/services/boss-trip*.service.ts`, `POST /api/game/travel/trip`,
  `/trip/extend`, `/trip/home`, the trip panel on Travel (`TripPanel.tsx`), and the
  `TRAVEL_INTEGRATION` suite `boss-trip.integration.test.ts`.

## Stage B - built: the boss rides along

Decided after Stage A: rather than a separate driving trip, **a run can take the boss
with it**, and solo flights stay. Runs themselves are unchanged for crew-only use.

Ruleset `classic-og-trips-b` (Trips A plus `travel.trips.rideAlong`).

- **"The boss rides along"** is a checkbox on the run launch. The escorts are the
  entourage, with the guns they already carry; the Low-Riders are the seats.
- **Stay until you leave.** With the boss aboard, every town the run stops in holds it
  until the player drives on or heads home, up to 24 hours (crew-only runs keep the
  2-hour window). If nobody touches it, it heads home when the 24 hours are up.
- **The hotel bills the run's cash by the started hour:** the boss's room at the city's
  rate plus $20 an hour for each escort. The first hour is charged on arrival. When the
  cash in the car cannot cover the next hour, the boss checks out at that hour and the run
  heads home with whatever is left. Heading home or driving on stops the bill.
- **Lazy and idempotent** like everything else on a run: the bill settles in the run's
  settle (road stops on the way in, then the hotel, then any re-timed leg), and
  `Run.hotelStayAt` / `hotelHours` record what is paid, so a read never bills an hour twice.
- **One boss.** A boss on a plane cannot ride along (`BOSS_AWAY`), a boss riding along
  cannot fly (`BOSS_ON_RUN`), and at most one active run carries the boss (a partial
  unique index backs that up).
- **The lieutenant** skims Scout and Produce while the boss is riding, exactly as on a
  flight, and stops the moment the run is home.
- **Screens:** the launch checkbox with the hourly price, the boss and hotel lines on the
  active run, the hotel on the run receipt, the trip panel showing "riding with your run",
  and activity lines for a boss run leaving and coming home.

## Stage C - built: the boss is hunted

Ruleset `classic-og-trips-c` (Trips B plus `travel.trips.hunted`). It runs on the convoy
clock and rules: the 8-minute window, 8 turns a hit, the re-hit cooldown and the carry cap.

- **Finding a visiting boss.** The area recon on the Convoys panel now also lists bosses on a
  flight trip in the player's city, in town or landing within the recon's lookahead. A solo
  boss keeps a low profile: each recon spots them only half the time, rolled per boss and
  per recon, so another look can find them.
- **The hit.** Only players who live in that city can hit a visiting boss, with a squad from
  home, and only once their recon has spotted them. The squad is committed (busy) for the
  window. One hit on a boss at a time, one squad out per attacker across convoy tails and boss
  hits, no allies or linked accounts, and not your own boss.
- **Landing.** The hit lands in the boss's own trip settle when the window closes, whoever
  reads first (the attacker's pages and the alerts poller both push it). A boss still in town
  has nobody with them, so the hit succeeds. It takes 25-60% of the bankroll, capped at $250
  per attacker, ends the stay, puts the boss on the next flight home and **lays them up for
  four hours**. A boss who checked out first gets away, and the squad comes home with nothing.
- **Heads-up.** The boss's lookouts spot the hit in its last minutes, on the same clock as a
  convoy tail. The trip panel then warns them to check out.
- **Riding along.** A convoy hit that beats a run with the boss aboard also lays the boss up,
  and a run in town heads home from the moment of the hit.
- **Laid up** means no flights and no riding along until healed. The lieutenant keeps
  skimming and home keeps its weaker defense until then. Home still works (option B).
- **Home defends weaker** while the boss is away or laid up: raids and special raids against
  them fight at 95% of home's defense. The battle's stored calculation records it.
- **Screens:** visiting bosses and hits on bosses on the Convoys panel, the lookout warning
  and the laid-up note on the trip panel, and activity lines for all three sides.

Not built yet:
- **Calling allies to a boss in town.** A solo boss is meant to be defenseless; an entourage
  that flies in (to be armed by a local gun connect) belongs with the Stage D hooks.
- **Happiness drift while away** (option B). It needs time-based happiness state that does not
  exist yet, and is left for the balance pass (E).
- **Airport Heat checks** on flights.
- **Hotel billing after a convoy hit.** If nobody reads a ride-along run between a hit
  landing and its settle, the hotel can bill the hours in that gap. The alerts poller lands
  hits every minute, so the gap is at most one started hour.

## Open questions

1. **Tuning the lieutenant.** What percent is the boss-away cut, and should it grow the
   longer you are gone?
2. **Flight time and ticket price.** Flat between any two cities, or scaled by distance?
   Does the airport check use the departure city's Heat lines, the arrival city's, or both?
3. **Entourage cap.** Flat number, share of thugs, or bought by a hideout room (a "security
   detail")?
4. **Should a trip cost turns?** Runs do. A small launch cost in turns keeps trips from
   being free, and the stay itself costs cash.
5. **Can the boss do home actions from the road at all** during the travel legs, or only
   once checked in?
6. **Whale visibility.** Should a big bankroll make you show up on everyone's recon in that
   city, or only paid recon?
7. **Kidnapping / ransom** of a solo boss: fun, or too punishing? Parked for now.
