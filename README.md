# StreetsEmpire

A reconstruction of the OG Pimp War economic loop.

**Live version:** `0.4.0-E` &middot; **Development:** `0.5.0-F` Travel &middot; **Dev ruleset:** `classic-og-v0.5-f`

---

## Where this is

The economic foundation is built, and the current ruleset now uses one unified
**Jobs & Contacts** progression system. Named contacts offer tracked quests with
event-driven and current-state objectives; job rewards grant contact reputation,
cash/items, and permanent-in-round access such as Shotguns, Tek-9s and AK-47s.
The older four trader favors remain only inside pinned historical rulesets.

**0.2.0-A** added an isolated combat model and repeatable balance simulator.
**0.2.0-B** adds a selectable cash-raid ruleset for new rounds, with eligible
targets, automatic defense, target protection, durable retry receipts and battle
reports. **0.2.0-C** adds persistent temporary wounds, natural recovery, and
medicine treatment in its own pinned ruleset. **0.2.0-D** adds recon intel and
24-hour revenge windows in a new strategy ruleset. **0.2.0-E** adds a self-contained onboarding round with seeded local rivals, tooltips, harsher unarmed-thug happiness penalties, armed-thug scouting coverage, public legacy rankings, weighted raid loot, repeat-target diminishing returns, drive-bys and a full achievement gallery. **0.2.0-F** turns that ruleset into the first public raid round: production rankings and combat targets only show active player accounts, while local development can opt into seeded rivals for solo testing, and old-school raid forms now include drug runs, ride theft and luring unhappy crew. **0.2.0-G** keeps F balance and starts the street-polish pass: clearer special raid reports, scouted-target cues, public onboarding copy and a free Flarum community direction. **0.2.0-H** keeps G balance and starts raid trophies for drive-bys, drug runs, ride theft and lure runs. **0.3.0-A** keeps H balance and makes rounds real seasons: expired rounds close once, standings freeze, players see a round-over screen, and past podiums land in the Hall of Fame. **0.3.0-B** keeps A balance and starts the admin panel: admins can schedule, open, start, end early and archive rounds without re-running the seed, and every admin action writes an audit record. **0.3.0-C** keeps B balance and adds alliances of up to five: allies cannot raid, drive-by, run any special raid form on or recon each other, a hit on one member opens revenge for all of them, and anyone who leaves or is kicked waits 24 hours before joining another alliance or trading blows with their old crew. **0.3.0-D** keeps C balance and lets alliances play together: fresh recon is shared with current allies, alliances talk on a members-only wire, and every player keeps a private contacts rolodex. Older rounds stay pinned to their original rulesets, while the default development seed now makes Game #018 the current `classic-og-v0.5-c` Travel round. **0.4.0** turns Product into a management system; see the [0.4.0 roadmap](docs/ROADMAP-0.4.0.md). **0.5.0** adds cities, runs, shared high markets and road risk; see the [0.5.0 roadmap](docs/ROADMAP-0.5.0.md). Read the [H implementation notes](docs/COMBAT-0.2.0-H.md), the [G implementation notes](docs/COMBAT-0.2.0-G.md), the [F implementation notes](docs/COMBAT-0.2.0-F.md), the [E implementation notes](docs/COMBAT-0.2.0-E.md), the [D implementation notes](docs/COMBAT-0.2.0-D.md),
the [C implementation notes](docs/COMBAT-0.2.0-C.md), the [B implementation notes](docs/COMBAT-0.2.0-B.md), the
[staged combat design](docs/COMBAT-DESIGN-0.2.0.md), the
[simulation findings](docs/COMBAT-SIMULATION-0.2.0-A.md) and the
[community/SSO forum plan](docs/COMMUNITY-SSO-FORUM.md), or run `npm run qa:combat`.
Admins run seasons, moderation and disputes from the [admin runbook](docs/ADMIN-RUNBOOK.md).

Forward roadmaps: [0.6.0 Turf](docs/ROADMAP-0.6.0.md), [0.7.0 Hideout](docs/ROADMAP-0.7.0.md), [0.8.0 Stores & Economy](docs/ROADMAP-0.8.0.md), [0.9.0 Community](docs/ROADMAP-0.9.0.md), [1.0.0 Launch & Hardening](docs/ROADMAP-1.0.0.md), and the [post-1.0 future roadmap](docs/ROADMAP-FUTURE.md).

| Milestone | Scope | State |
| --- | --- | --- |
| **0.1.0-A** | monorepo, database, Prisma, Fastify, React, auth, ruleset loader, Round, RoundPlayer | **done** |
| **0.1.0-B** | turn service, net worth service, happiness service, rank service, dashboard API | **done** |
| **0.1.0-C** | Scout, Produce Crack, Payout, supplies, departures, action results | **done** |
| **0.1.0-D** | Corner Store, Tek9 Tommy's, Charlie's Chop Shop, Pip's Deals on Wheels | **done** |
| **0.1.0-E** | rankings, profile, game status, news, activity, responsive UI | **done** |
| **0.1.0-F** | transaction tests, rate limits, mobile and reconnect testing (idempotency landed early, in C) | **done** |
| **0.1.0-G** | quality-of-life, action receipts, quick resources, refresh-on-return, UI consistency | **done** |
| **0.1.0-H** | release-candidate regression, load/exploit checks, balance and production QA | **done** |
| **Jobs & Contacts** | unified quest engine, six contacts, contact reputation, tracking, first 10 story jobs, job-based weapon access | **implemented in beta** |
| **0.7.0-G** | permanent unlock ledger; job-earned weapon rack access; Pip Meth/Ecstasy/Cocaine/Heroin purchase progression | **implemented in beta** |
| **0.2.0-A** | combat model, balance simulator, tests and staged design | **prototype complete; balance provisional** |
| **0.2.0-B** | selectable cash-raid ruleset, raid API, target protection, reports and retry recovery | **implemented for new combat rounds** |
| **0.2.0-C** | persistent wounds, fit crew, natural recovery and medicine treatment | **implemented for new recovery rounds** |
| **0.2.0-D** | recon intel, persisted scouting reports and 24-hour revenge attacks | **implemented for new strategy rounds** |
| **0.2.0-E** | seeded local rivals, tooltips, harsher unarmed-thug morale, armed street coverage, public legacy rankings, fuller achievements and drive-bys | **implemented for local onboarding rounds** |
| **0.2.0-F** | public raid round, drug-hoe runs, ride theft, luring unhappy crew, production active-player targets and local opt-in rival seeding | **started; public baseline implemented** |
| **0.2.0-G** | street polish, clearer raid reports, scouted target cues, homepage onboarding and free forum direction | **started** |
| **0.2.0-H** | raid-form achievement trophies and special-raid balance pass | **started** |
| **0.3.0-A** | season end, frozen final standings, round-over handoff and Hall of Fame | **implemented** |
| **0.3.0-B** | admin panel: audited round scheduling and lifecycle controls first; news with forum mirroring, accounts and dev bots next | **started** |
| **0.3.0-C** | alliances: membership with an atomic size cap, alliance page and rankings, tags, no friendly fire, shared revenge, leave cooldown, admin rename and disband, Discord alliance roles and forum recruitment threads | **implemented** |
| **0.3.0-D** | playing together: shared alliance recon, members-only alliance wire with moderation, private contacts; defense reinforcement simulated and held for 0.3.0-E | **implemented** |
| **0.3.0-E** | balance and release: alliance season regression and exploit checks, battle balance data and the admin alliance balance report; balance decisions wait for a public alliance round | **started** |
| **0.4.0-A** | products & vice foundation: ruleset product catalog, hybrid product inventory (crack on its column, other products in rows), Products page | **implemented** |
| **0.4.0-B** | work supply: primary, fallback and emergency product per district and Produce shift, or strict; trips sliced by product; preview before sending | **implemented** |
| **0.4.0-C** | product effects and Heat: each product's take, recruits, walkouts and happiness by district; production thugs burn product; Heat drags the take, risks busts, cools and can be bribed down | **implemented** |
| **0.4.0-D** | product economy: Pip deals every product from its own shelf, Produce cooks Crack, Meth or Ecstasy, raids and drug runs take a product mix, recon reads stash levels, every product counts toward net worth | **implemented** |
| **0.4.0-E** | products release: thugs take product into fights (RAID and DEFENSE policies), supply status and shortage warnings, combat and full-round product simulations, 0.4.0 release regression | **implemented** |
| **0.5.0-A** | travel, cities: every city's character in the ruleset (Pip's prices and supply, demand, police, Heat levels), real interstates between them, the Cities page, and the travel simulation gate; everyone still lives in New York | **implemented** |
| **0.5.0-B** | runs: Low-Riders carry escorts, cash and product out of home stock on real roads; trade at Pip's counter in other cities from the run's own wallet and trunk; drive on or head home; the crew remembers what it saw; the Travel page | **implemented** |
| **0.5.0-C** | high market & risk: shared city markets with price impact and recovery; seeded Pip supply swings and price events; street wire; sale Heat; road stops; city arrests and downtime; market/risk simulation gate | **implemented** |
| **0.5.0-D** | relocation: move the whole operation for a fee on net worth and six hours on the road; still a target at home until arrival; no moves with a run out, inside a revenge window, within the cooldown or in the round's last day; where you live sets district pay, store prices, Pip's home counter and Heat lines | **implemented** |
| **0.5.0-E** | convoys: a crew recons its area for turns to find runs coming near, in town or leaving; only a run it spotted can be tailed, and the hit lands when an eight-minute window closes if the run is still in reach; no alerts, only a Lookouts heads-up of a few minutes; home backup near home, backup the owner sends and allies who answer a call once seen; escorts ride armed from home and lose their guns to a bust or arrest; CONVOY fight supply; cash and cargo loot, a Low-Rider when the escort goes down; no hits on allies or linked accounts; admin void and signals; convoy win-rate gate | **implemented** |
| **0.5.0-F** | the travel release: a run can buy wholesale on its own city's high market as it loads up (buying only, so cooking to sell still never pays); Seattle's and Miami's casinos pay a little less and Miami's Pip runs short of ecstasy, so every home city has a reason to drive; a full-round simulation of street-only, runner, mover, hijacker and mixed play across all eight cities, gated so mixed play beats the street alone and running alone; a Travel panel on the Rules page; travel suites in the release regression | **implemented** |

Cash raids, drive-bys, special raid forms and alliances are playable. Runs drive the road map to trade at Pip's counters and shared high markets in other cities, with changing supply, road stops and city-specific Heat thresholds; see [docs/ROADMAP-0.5.0.md](docs/ROADMAP-0.5.0.md). Messaging remains deliberately absent.

---

## Running it

Requires Node 20+ and Docker.

```bash
npm install
cp .env.example .env      # already done if .env exists
npm run db:up             # postgres 16 on localhost:5433
npm run db:migrate        # apply migrations
npm run db:seed           # 8 cities, pinned older rounds, current Game #018 Travel / 0.5.0-F round
npm run dev               # api on :3001, game web on :5173, public site on :5174
```

Open <http://localhost:5173> for the playable game, or <http://localhost:5174> for the public website. Register a name in the game app and enter Game #018 - Travel. New players start in New York and can send Low-Rider runs to all eight cities. The current development round uses `classic-og-v0.5-f`, so shared high markets, moving Pip supply, price events, road stops, sale Heat, arrests, moving house, convoys and loading up on your own city's market are all active. Default seeds no bot rivals; for local solo raid testing, run `npm run db:seed:dev-bots` to add active dev bots for cash raids, drug runs, ride theft, lures and drive-bys.

| Script | Does |
| --- | --- |
| `npm run dev` | API, playable game web, and public site together |
| `npm run dev:server` / `npm run dev:web` / `npm run dev:site` | one at a time |
| `npm test` | ruleset and engine tests |
| `npm run typecheck` | every workspace |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | drop, re-migrate, re-seed |
| `npm run db:seed:combat` | create local Game #002 with `classic-og-v0.2` cash raids |
| `npm run db:seed:combat:recovery` | create local Game #003 with `classic-og-v0.2-c` recovery raids |
| `npm run db:seed:combat:strategy` | create local Game #004 with `classic-og-v0.2-d` strategy raids |
| `npm run db:seed:combat:onboarding` | create local Game #005 with `classic-og-v0.2-e` and seeded rivals |
| `npm run db:seed:dev-bots` | reseed the current public raid round with active local bots for testing every raid form |
| `npm run db:dev-bots:status` | show seeded bot accounts and whether they are in the current round |
| `npm run db:cleanup:seed-rivals` | remove seeded rival/dev bot accounts |
| `npm run admin -- <username or email>` | make an account an admin (`--off` removes it, `--list` shows who has it); writes to the admin audit log |

---

## Layout

```text
apps/
  server/         Fastify API
    src/auth/       argon2id hashing, session store
    src/config/     env validation
    src/game/       DTO mappers (the API contract boundary)
    src/plugins/    prisma, auth, error handling
    src/routes/     HTTP surface
    src/services/   game logic, one concern per file
                    (action.service.ts is the shared section 51 pipeline)
  web/            React + Vite + Bootstrap 5.3.8
    src/api/        typed fetch wrappers
    src/components/ panels, rows, stats, fields, activity feed
    src/hooks/      live refresh, turn countdown
    src/layouts/    app shell, status bar, game sidebar
    src/pages/      landing, register, login, join, dashboard
    src/stores/     zustand session store
    src/styles/     the theme

packages/
  rulesets/       classic-og-v0.1 - every balance number in the game
  rules-engine/   the loader, the pure calculators and the injected RNG
  shared/         zod schemas, API types, money formatting

prisma/           schema, migrations, seed
```

---

## Conventions that matter

**Money is integer cents.** `$1.00` is `100`, `$0.10` is `10`. Cash and net worth are
`BigInt` in Postgres, cross the wire as `*Cents` numbers, and are formatted only at the
last moment by `@streets/shared`. Nothing divides money in transit.

**Balance numbers live in `packages/rulesets` and nowhere else.** If a service needs a
price, a rate or a threshold, it reads it from the ruleset it loaded for that round.
Approximations of Classic behaviour are marked `BALANCE_APPROXIMATION` so they can be
retuned in one place &mdash; whore happiness is the main one.

**Rounds pin their ruleset.** `Round.rulesetId` and `Round.rulesetVersion` are loaded
through `loadRulesetForRound()`, which throws rather than quietly playing by different
numbers than the round was created with.

**Seasons are fair competitive resets.** `Account` is the permanent identity;
`RoundPlayer` is the seasonal run. Cash, crew, weapons, inventory, shop stock,
cooldowns, protection, trader reputation and ranks live on `RoundPlayer` and do not
carry into the next season. Finished seasons keep their frozen `RoundPlayer` rows as
career history only: Hall of Fame podiums, profile badges, final ranks, final net worth
and season stats can follow the account, but none of that history changes a new
round's starting kit.

**Turns regenerate lazily.** No job sweeps the player table every five minutes. Whole
elapsed intervals are settled on read and `lastTurnCalculationAt` advances by exactly
those intervals &mdash; never to `now`, which would discard the part-served interval on
every page load. The clock advances even at the cap, so idling there cannot bank
hours of turns that dump the moment one is spent.

**A background poll is not the player.** `GET /api/game/me?background=1` settles turns
but does not touch `lastActiveAt`, so a tab left open overnight still earns the away
bonus. Anything the player actually did counts as activity.

**Every read goes through one path.** `PlayerStateService.settle()` locks the row,
refreshes turns, recalculates happiness, net worth and ranks, takes the daily rank
snapshot if it is stale, and writes only what moved. It is the opening move of every
action in 0.1.0-C, and it means a dashboard poll on an idle player costs reads only.

**One ruleset, many possible rulesets.** `Ruleset` is a declared interface in
`packages/rulesets/src/types.ts`, not the shape of the classic numbers. A future
ruleset with different values satisfies it; a ruleset missing a knob fails to compile.

**One action pipeline.** `ActionService.run()` is the whole of section 51: lock the
player, check for a replay, settle turns, let the action decide only what the numbers
become, then recalculate happiness, net worth and ranks, write the activity row and
commit. Scout, Produce and Payout are each about forty lines because none of them
touches the clock, the database or any derived value.

**Nothing executes twice.** Every action carries a client-minted `actionId`. The replay
check runs *after* the row lock &mdash; checking before it lets two concurrent
duplicates both look, both find nothing, and both spend. A repeat answers with the
original result for ten minutes.

**Two actions, straight from the manual.** There is no separate "work" action; the
game has exactly what manual sections 3.1 and 3.2 describe.

*Scout* (the manual's "Scout for Whores") is 3.1 &mdash; "where to go to make money for yourself, and go out
and pickup some whores and thugs". One trip does both jobs on the same turns: the girls
work the block while you work the room. That is why a district is two offers pulling
against each other, and why no district is simply best. The manual's suggested spend of
12-14 turns is `scouting.recommendedTurns`, and the turn box defaults to it.

*Produce Crack* is 3.2 &mdash; "sends your whores out, while your thugs produce crack
to keep your whores happy, and keeps them from leaving you. But the whores produce less
money because the thugs are busy and not managing the hoes." So cooking is not a rest
day: the girls still work and still burn the shelf, at `unsupervisedTakeMultiplier`
(0.35x) of a scouted night, because the muscle that would be running them is inside.
What that lost income buys is the crack that stops the stable shrinking.

The trade is therefore money now versus the thing that keeps what you have. Both
sentences of the manual have tests of their own so the model cannot drift back.

**A hard low, never a dead end.** Earnings scale off whore happiness down to a
floor (`minHappinessMultiplier`, 0.15) rather than to zero, so a crew at rock bottom
still limps in enough to restock and raise the cut.

**Happiness is a pure reading of current state.** The cut you pay, what is on the
shelves and how many thugs are watching - nothing accumulates and nothing has to be
waited out. Every input is something the player can change on their next action, and
the dashboard names which term is costing them what.

There is deliberately no fatigue or wear system. An earlier build had one; it was never
in the spec, it modified the section 20 formula the spec calls frozen, and it grew to
outweigh every specified term combined. It has been removed.

**Recruitment has diminishing returns.** A district holds a finite number of people
with nowhere better to be, so a headline rate is what a nobody gets, not what an empire
gets: `softCap / (softCap + crew)`, half rate at 100 whores or 50 thugs. Growth over a
round goes from linear to roughly the square root of turns spent &mdash; without it, a
round of pure scouting ends at ~14,500 whores and $29M; with it, ~1,600 and $3.2M.

The scout page shows the rates the current crew would actually get rather than the
headline ones, so a shrinking number reads as a mechanic and not a bug.

**Supplies are a bill, not a formality.** Whore happiness is docked for a short condom
shelf (up to 30 points) and a short crack shelf (up to 25). Crack burns at 0.05 per
whore per turn rather than the 0.01 section 27 implies &mdash; at 0.01 a stable burns
almost nothing, so there is no bill for a thug's cooking to replace and Produce Crack
has no reason to exist at all.

Street work rounds condom and beer demand up to whole items and uses only stock on
hand. Running the shelf down lowers happiness on the next read, and restocking lifts it straight back.

**Stores validate the whole order.** Quantities must be positive integers, the item
must belong to the store, and selling is offered only where a buyback price exists.
Orders exceeding cash, stock or storage limits fail without a partial fill. Prices
come from the round's ruleset, never from the browser. The existing locked action
pipeline settles happiness, net worth, ranks and activity atomically. Max uses cash
for buying and stock for selling; quick fills are supplied by the ruleset.

**Randomness is injected.** Every calculation that rolls takes an `Rng`, so tests pin
exact numbers and a seeded or replayable round needs no maths rewritten.

**Errors are written for players.** `AppError` carries a code, a sentence a human can
act on, and optional per-field messages. Framework errors are logged, not shown.

**Sessions are http-only cookies.** A 256-bit random token, signed, with only its
SHA-256 hash stored. Nothing auth-related goes near `localStorage`.

---

## What is shipping so far

**API**

```text
GET  /api/health
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/rounds/current
POST /api/rounds/current/join
GET  /api/rounds/current/status
GET  /api/game/me[?background=1]
GET  /api/game/districts
POST /api/game/scout
POST /api/game/produce-crack
PUT  /api/game/payout
GET  /api/game/stores
POST /api/game/stores/trade
GET  /api/game/quests
POST /api/game/quests/:key/accept
POST /api/game/quests/:key/abandon
POST /api/game/quests/:key/track
POST /api/game/quests/:key/claim
GET  /api/game/combat
POST /api/game/combat/raid
POST /api/game/combat/drive-by
POST /api/game/combat/special
POST /api/game/combat/recon
POST /api/game/combat/treat
GET  /api/game/combat/reports
GET  /api/game/rankings
GET  /api/game/hall-of-fame
GET  /api/game/career
GET  /api/game/players/:publicPimpId
GET  /api/game/activity
```

**Joining a round** runs as one transaction: allocate the public pimp id from the round
counter, seed starting resources from the ruleset, derive happiness and net worth
immediately, take the opening rank snapshot, and log `ROUND_JOINED`.

**The dashboard** is one request (section 45) and refreshes itself on mount, on tab
focus, on `visibilitychange`, every sixty seconds, and whenever the turn countdown
lands &mdash; so it never acts on stale numbers.

The frozen 0.1.0 round still gives exactly section 11: `$5,000`, 144 turns, 1 whore, 1 thug, 250 condoms,
100 crack, 10 beer, 50% payout, New York City &mdash; which is a net worth of `$6,827`,
100% whore happiness and 99% thug happiness (one thug, no gun). The current 0.3.0-A public season starts players at `$20,000` with 10 thugs, 10 pistols, beer and medicine, then freezes final standings when the round ends. Production rankings, profiles and combat lists show active player accounts only; local development can opt into active dev bots with `npm run db:seed:dev-bots`. Missing guns cost more thug happiness, only armed fit thugs count as street cover while scouting, luring can pull unhappy hoes and thugs with crack and beer, special raid reports explain the outcome, raid-form achievements track the newer attacks, and public pages show money, rank tenure, movement, past results and a fuller achievement gallery while opponent crew, weapons, wounds, exposed cash and crack stash stay behind recon.

**Tests** cover the frozen formulas, the loader and the services built on them:
turn regeneration and the cap, the remainder that survives a settle, the away bonus and
its anti-farm rule, the cap applied once to regeneration plus bonus, the section 53 net
worth fixture, thug and whore happiness, payout bounds, the daily rank boundary, ruleset
version pinning, a variant ruleset flowing through every calculator, the section 27 and
30 consumption and recruitment figures, income scaling and the payout split, departures,
and the section 50 turn-shortage wording. Store tests cover every item and buyback,
cash and inventory limits, malformed orders, custom ruleset prices and net worth.

`npm test` runs 196 tests without requiring the database. To also run the eleven store
API integration tests against a seeded local database with an active round:

```powershell
$env:STORE_INTEGRATION = '1'
npm test
Remove-Item Env:STORE_INTEGRATION
```

The integration suite creates a disposable account and removes it and its related
data afterwards. It checks authentication, full receipts, restocking happiness,
rollback, duplicate buys and sells, and competing orders with insufficient cash or
stock, weapon purchase locks, quest-driven access, transaction retries, reputation increments and round isolation. The combined suite has 207 passing tests. Browser checks cover purchases,
sell-Max, receipts, updated inventory and the store layout at phone widths, plus
both favors, unlocked buy buttons and access surviving a reload.

The concurrency guarantees are checked against a running server rather than a mock: two
simultaneous submits with one action id spend turns once and both receive the same
result; two with different ids that would together overspend leave the player at exactly
one action's worth of turns, never negative.

---

## 0.1.0-F hardening

The foundation release is hardened for real browser/network behavior. Login/register,
reads and writes have separate rate-limit buckets; confirmed writes still use the
existing transactional action pipeline. Store transactions whose reply is lost are
saved in session storage with the exact `actionId`, survive a reload, and can be
replayed safely while the server's idempotency record is still live. API requests time
out instead of hanging forever, and the dashboard refreshes immediately when the
browser reconnects.

F also adds opt-in PostgreSQL transaction tests for duplicate Scout, Produce Crack and
Payout requests, concurrent turn spending, and rollback of rejected actions. Mobile
hardening raises coarse-pointer touch targets, prevents iOS input zoom, and keeps dense
result rows usable on narrow screens.

To run both database-backed integration suites locally:

```powershell
$env:STORE_INTEGRATION = '1'
$env:TRANSACTION_INTEGRATION = '1'
npm test
Remove-Item Env:STORE_INTEGRATION
Remove-Item Env:TRANSACTION_INTEGRATION
```

---
## 0.1.0-G quality-of-life

G is the "stop making the player remember numbers" pass. Every game page now has a
compact resource strip for Turns, Cash, crew and the consumables used by actions.
Returning to a non-dashboard game page, switching back to the tab/window, restoring a
back-forward-cache page, or reconnecting the browser refreshes the authoritative
snapshot before the next decision.

Action receipts use one `change / remaining` convention. Scouting shows recruits and
the new crew total; Work shows found/used supplies and remaining stock; Production
shows output, cash ingredients, beer and departures with what remains; store trades and
Tommy favors show the resulting inventory/cash balance. Payout changes give an explicit
success confirmation.

---
## 0.1.0-H release candidate

H freezes the 0.1.0 foundation before 0.2.0 expands the game. Economy writes now
require idempotency ids, and one id is bound to one action type. ActionService checks
server-side invariants before committing so negative/fractional inventory, negative
cash/turns or an invalid payout roll back instead of becoming exploitable
state.

The server exposes separate liveness (`/api/health`) and readiness (`/api/ready`)
checks, adds production-safe API headers, and the browser makes offline state explicit.
The release gate runs typecheck, unit tests and the production build, with opt-in
PostgreSQL regression and production-environment checks. A configurable load-smoke
runner and the complete mobile/deployment checklist live under `scripts/qa` and
`docs/RELEASE-0.1.0-H.md`.

With H complete, 0.1.0 is the frozen core foundation. New gameplay systems belong in
0.2.0 rather than continuing the letter milestones.

---
## Known gaps

- District balance is a `BALANCE_APPROXIMATION`: recruitment and an income multiplier
  that trade against each other. The spec's own examples only ever showed one district,
  so the spread across five is a design call, tuned wide on purpose.
- Low-Riders now set run cargo capacity and escort seats in 0.5.0-B/C. Convoy combat around those runs is reserved for 0.5.0-E.
- Store orders retry safely while the page stays open. Persisting pending orders
  through reloads and broader reconnect testing remain in 0.1.0-F.
- The daily rank snapshot is taken the first time a player is seen after the reset
  hour, not by a nightly sweep, so a player who does not log in for two days measures
  movement from when they came back.
- Ranks are two live `COUNT` queries per read. Fine at this size; `RankingService` is
  the one file to change when it is not.
- `npm audit` reports one advisory in the Prisma **CLI** dependency chain
  (`deepmerge-ts`, a stack-exhaustion DoS in config merging). It affects the dev tool,
  not `@prisma/client` at runtime. The fix is Prisma 7, which is a breaking upgrade
  worth doing on its own.
