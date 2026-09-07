# Street Empire

A reconstruction of the OG Pimp War economic loop.

**Version:** `0.1.0` &middot; **Ruleset:** `classic-og-v0.1` &middot; **Milestone:** `0.1.0-C` complete

---

## Where this is

`0.1.0-C` &mdash; Economy Actions. **Done when a player can grow entirely through
turns.** They can: scout five districts for crew and cash, cook crack, and set the
payout &mdash; each answering with a full before/after result screen.

| Milestone | Scope | State |
| --- | --- | --- |
| **0.1.0-A** | monorepo, database, Prisma, Fastify, React, auth, ruleset loader, Round, RoundPlayer | **done** |
| **0.1.0-B** | turn service, net worth service, happiness service, rank service, dashboard API | **done** |
| **0.1.0-C** | Scout, Produce Crack, Payout, consumption, departures, action results | **done** |
| 0.1.0-D | Corner Store, Tek9 Tommy's, Charlie's Chop Shop, Pip's Deals on Wheels | next |
| 0.1.0-E | rankings, profile, game status, news, activity, responsive UI | |
| 0.1.0-F | transaction tests, rate limits, mobile and reconnect testing (idempotency landed early, in C) | |

PvP, alliances, travel, messaging and the rest of 0.2.0 are deliberately absent. The
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
npm run db:seed           # 8 cities, Game #001, first news post
npm run dev               # api on :3001, web on :5173
```

Open <http://localhost:5173>, register a name, and enter Game #001.

| Script | Does |
| --- | --- |
| `npm run dev` | API and web together |
| `npm run dev:server` / `npm run dev:web` | one at a time |
| `npm test` | ruleset and engine tests |
| `npm run typecheck` | every workspace |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | drop, re-migrate, re-seed |

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

**Scouting is working a district.** A turn spent scouting puts the girls on that block
for the night with you out there running them, which is why the district multiplies
income as well as recruitment: the Casino pays well and turns up few new faces, the
Wino Slums are the reverse. Cooking means you are indoors, so the shift earns the
unsupervised rate (25%) instead.

**The payout is a real decision.** Whore income scales linearly with whore happiness,
and happiness drops a point per point below the neutral 50% cut. Squeezing raises your
share of a shrinking pot, so the curve has an optimum in the middle and punishes both
ends. Below 40% happiness people start walking.

**Recruitment has diminishing returns.** A district holds a finite number of people
with nowhere better to be, so a headline rate is what a nobody gets, not what an empire
gets: `softCap / (softCap + crew)`, half rate at 100 whores or 50 thugs. Growth over a
round goes from linear to roughly the square root of turns spent &mdash; without it, a
round of pure scouting ends at ~14,500 whores and $29M; with it, ~1,600 and $3.2M.

More importantly it gives the round an arc. Below about a hundred whores the Wino Slums
are the best turn in the game; above it the Casino is, because new faces are worth less
than money. The scout page shows the rates you would actually get rather than the
headline ones, so a shrinking number reads as a mechanic and not a bug.

**Supplies are a bill, not a formality.** Whore happiness is docked for a short condom
shelf (up to 30 points) and a short crack shelf (up to 25). Crack burns at 0.05 per
whore per turn rather than the 0.01 section 27 implies &mdash; at 0.01 a stable burns
almost nothing, so there is no bill for a thug's cooking to replace and Produce Crack
has no reason to exist at all.

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
```

**Joining a round** runs as one transaction: allocate the public pimp id from the round
counter, seed starting resources from the ruleset, derive happiness and net worth
immediately, take the opening rank snapshot, and log `ROUND_JOINED`.

**The dashboard** is one request (section 45) and refreshes itself on mount, on tab
focus, on `visibilitychange`, every sixty seconds, and whenever the turn countdown
lands &mdash; so it never acts on stale numbers.

A new player gets exactly section 11: `$5,000`, 200 turns, 1 whore, 1 thug, 250 condoms,
100 crack, 10 beer, 50% payout, New York City &mdash; which is a net worth of `$8,075`,
100% whore happiness and 99% thug happiness (one thug, no gun).

**Tests** (105) cover the frozen formulas, the loader and the services built on them:
turn regeneration and the cap, the remainder that survives a settle, the away bonus and
its anti-farm rule, the cap applied once to regeneration plus bonus, the section 53 net
worth fixture, thug and whore happiness, payout bounds, the daily rank boundary, ruleset
version pinning, a variant ruleset flowing through every calculator, the section 27 and
30 consumption and recruitment figures, income scaling and the payout split, departures,
and the section 50 turn-shortage wording.

The concurrency guarantees are checked against a running server rather than a mock: two
simultaneous submits with one action id spend turns once and both receive the same
result; two with different ids that would together overspend leave the player at exactly
one action's worth of turns, never negative.

---

## Known gaps

- There is nothing to spend cash on yet. The four stores are 0.1.0-D, and the sidebar
  marks every unbuilt destination with the milestone that brings it.
- District balance is a `BALANCE_APPROXIMATION`: recruitment and an income multiplier
  that trade against each other. The spec's own examples only ever showed one district,
  so the spread across five is a design call, tuned wide on purpose.
- **Supplies only ever go down.** There is no way to buy condoms, beer or medicine
  until the Corner Store lands in 0.1.0-D, so a long session can only degrade: happiness
  falls, income falls with it, and eventually people walk. That is the milestone
  boundary showing, not a balance problem.
- **Cooking still loses to scouting per turn.** Diminishing returns narrowed the gap by
  making late scouting much weaker, but crack is capped at what Pip's charges while a
  district multiplies income without limit, so the rich districts still win the turn.
  Cooking is the cash-poor bootstrap move and a stockpile for 0.2.0's Steal Whores with
  Crack. Closing it properly needs crack that cannot simply be bought.
- The daily rank snapshot is taken the first time a player is seen after the reset
  hour, not by a nightly sweep, so a player who does not log in for two days measures
  movement from when they came back.
- Ranks are two live `COUNT` queries per read. Fine at this size; `RankingService` is
  the one file to change when it is not.
- `npm audit` reports one advisory in the Prisma **CLI** dependency chain
  (`deepmerge-ts`, a stack-exhaustion DoS in config merging). It affects the dev tool,
  not `@prisma/client` at runtime. The fix is Prisma 7, which is a breaking upgrade
  worth doing on its own.
