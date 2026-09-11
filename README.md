# Street Empire

A reconstruction of the OG Pimp War economic loop.

**Live version:** `0.2.0-E` &middot; **Ruleset:** `classic-og-v0.2-e` &middot; **Development:** raid onboarding

---

## Where this is

The economic foundation and [trader reputation](docs/REPUTATION-DESIGN.md) are built.
Players earn standing through daily trading and four one-time favors. Total
reputation opens shotguns at 50, Tek-9s at 150 and AK-47s at 248, in that order.
Earned access lasts for the round. Each trader's standing also speeds up restocking.

**0.2.0-A** added an isolated combat model and repeatable balance simulator.
**0.2.0-B** adds a selectable cash-raid ruleset for new rounds, with eligible
targets, automatic defense, target protection, durable retry receipts and battle
reports. **0.2.0-C** adds persistent temporary wounds, natural recovery, and
medicine treatment in its own pinned ruleset. **0.2.0-D** adds recon intel and
24-hour revenge windows in a new strategy ruleset. **0.2.0-E** adds a self-contained onboarding round with seeded local rivals, tooltips, harsher unarmed-thug happiness penalties, armed-thug scouting coverage and public legacy rankings, so a solo developer can test recon, raids, wounds, reports and gun-readiness immediately. Older rounds stay pinned to their original rulesets, while the default local seed now makes Game #005 the current 0.2.0-E raid onboarding round. Read the [D implementation notes](docs/COMBAT-0.2.0-D.md),
the [C implementation notes](docs/COMBAT-0.2.0-C.md), the [B implementation notes](docs/COMBAT-0.2.0-B.md), the
[staged combat design](docs/COMBAT-DESIGN-0.2.0.md) and the
[simulation findings](docs/COMBAT-SIMULATION-0.2.0-A.md), or run `npm run qa:combat`.

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
| **Reputation** | four trader quests, daily standing, restock perks, reputation weapon unlocks | **done** |
| **0.2.0-A** | combat model, balance simulator, tests and staged design | **prototype complete; balance provisional** |
| **0.2.0-B** | selectable cash-raid ruleset, raid API, target protection, reports and retry recovery | **implemented for new combat rounds** |
| **0.2.0-C** | persistent wounds, fit crew, natural recovery and medicine treatment | **implemented for new recovery rounds** |
| **0.2.0-D** | recon intel, persisted scouting reports and 24-hour revenge attacks | **implemented for new strategy rounds** |
| **0.2.0-E** | seeded local rivals, tooltips, harsher unarmed-thug morale, armed street coverage and public legacy rankings | **started; local onboarding implemented** |

Playable PvP, alliances, travel and messaging are deliberately absent. The
database anticipates them (`ProcessedAction`, `City`, weapon `power`) without exposing
anything half-built to players.

---

## Running it

Requires Node 20+ and Docker.

```bash
npm install
cp .env.example .env      # already done if .env exists
npm run db:up             # postgres 16 on localhost:5433
npm run db:migrate        # apply migrations
npm run db:seed           # 8 cities, pinned older rounds, current Game #005 raid onboarding
npm run dev               # api on :3001, web on :5173
```

Open <http://localhost:5173>, register a name, and enter Game #005 - Raid Onboarding. New players start with cash, thugs and pistols, and the seed creates three local rivals to attack immediately.

| Script | Does |
| --- | --- |
| `npm run dev` | API and web together |
| `npm run dev:server` / `npm run dev:web` | one at a time |
| `npm test` | ruleset and engine tests |
| `npm run typecheck` | every workspace |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | drop, re-migrate, re-seed |
| `npm run db:seed:combat` | create local Game #002 with `classic-og-v0.2` cash raids |
| `npm run db:seed:combat:recovery` | create local Game #003 with `classic-og-v0.2-c` recovery raids |
| `npm run db:seed:combat:strategy` | create local Game #004 with `classic-og-v0.2-d` strategy raids |
| `npm run db:seed:combat:onboarding` | create local Game #005 with `classic-og-v0.2-e` and seeded rivals |

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

**Turns regenerate lazily.** No job sweeps the player table every ten minutes. Whole
elapsed intervals are settled on read and `lastTurnCalculationAt` advances by exactly
those intervals &mdash; never to `now`, which would discard the part-served interval on
every page load. The clock advances even at the cap, so idling at 200 cannot bank
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
POST /api/game/work
POST /api/game/produce-crack
PUT  /api/game/payout
GET  /api/game/stores
POST /api/game/stores/trade
POST /api/game/stores/unlock
GET  /api/game/combat
POST /api/game/combat/raid
POST /api/game/combat/recon
POST /api/game/combat/treat
GET  /api/game/combat/reports
```

**Joining a round** runs as one transaction: allocate the public pimp id from the round
counter, seed starting resources from the ruleset, derive happiness and net worth
immediately, take the opening rank snapshot, and log `ROUND_JOINED`.

**The dashboard** is one request (section 45) and refreshes itself on mount, on tab
focus, on `visibilitychange`, every sixty seconds, and whenever the turn countdown
lands &mdash; so it never acts on stale numbers.

The frozen 0.1.0 round still gives exactly section 11: `$5,000`, 200 turns, 1 whore, 1 thug, 250 condoms,
100 crack, 10 beer, 50% payout, New York City &mdash; which is a net worth of `$6,827`,
100% whore happiness and 99% thug happiness (one thug, no gun). The current 0.2.0-E raid onboarding round starts players at `$20,000` with 10 thugs, 10 pistols, beer and medicine, then adds three seeded local rivals so raids can be tested immediately. In E, missing guns cost more thug happiness, only armed fit thugs count as street cover while scouting, and public pages show money, rank tenure, movement, past results and awards while opponent crew, weapons, wounds and exposed cash stay behind recon.

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
stock, weapon purchase locks, favor prerequisites and costs, concurrent unlocks,
reputation increments and round isolation. The combined suite has 207 passing tests. Browser checks cover purchases,
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
- Low-Rider transport has no active use yet. Vehicles contribute net worth and can be
  resold; travel and transport objectives belong in later combat strategy slices.
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
