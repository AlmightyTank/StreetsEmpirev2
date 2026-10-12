# NPC Gangs Roadmap

Status: **Phases A-P built in beta, with real crews spawning into live rounds.**

NPC gangs are server-run seasonal crews that use the same core systems players use:
round players, cities, stores, production, raids, drive-bys, special raid forms,
reports, alerts, cooldowns and admin visibility.

The design target is "Tarkov scav pressure" for StreetsEmpire: dangerous when
ignored, readable when watched, and defeatable when players learn how they move.
They should make the city feel alive without replacing PvP, becoming free money,
or hitting players with unavoidable punishment.

## Design Pillars

- **Same-world rules.** NPC gangs spend turns, buy stock, produce product, raid,
  drive-by and use special raid forms through existing services.
- **Readable pressure.** Players should see warning signs before a city gets hot.
- **Defeatable danger.** NPC gangs can hurt careless players, but prepared players
  should be able to survive, counterplay and profit.
- **No silent punishment.** NPC hits create reports, alerts and admin evidence.
- **Tunable behavior.** Aggression, ambition, discipline, tier and archetype should
  be enough to shape a gang without custom scripting every move.
- **PvP stays central.** NPC content fills dead air and creates motion; it should
  not become the safest optimal path.

## Phase Map

| Phase | Status | Scope |
| --- | --- | --- |
| A | Built | Durable NPC gang foundation on top of `RoundPlayer`, ruleset contracts and dev-bot seeding. |
| B | Built | Scheduler loop and first economy action: NPC gangs produce product using the production service. |
| C | Built | Basic city-local cash raids against human players through the combat service. |
| D | Built | Special raid forms: drug hoes, steal ride and lure crew, with target checks. |
| E | Built | Drive-bys for high-aggression gangs with existing drive-by rules and reports. |
| F | Built | Restock and shopping so NPC gangs buy supplies, weapons, rides and product when short. |
| G | Built | Smarter weighted intent by archetype, tier, aggression, ambition and discipline. |
| H | Built | Player-facing local intel: rumors, recent hits and city danger level. |
| I | Built | Retaliation memory so NPC gangs remember attackers and can revenge-hit within limits. |
| J | Built | Turf behavior so NPC gangs claim, defend, pressure or abandon territory. |
| K | Built | Travel and migration so stronger gangs can relocate between cities. Crew runs are a follow-up. |
| L | Built | Escalation and dormancy so gangs heat up, cool down, recover or lay low. |
| M | Built | Boss and archetype personalities with named gangs and distinct patterns. |
| N | Built | Rewards and cleanup for beating NPC gangs or relieving city pressure. |
| O | Built | Admin controls for spawning, pausing, dormancy, tuning and memory inspection. |
| P | Built | Balance telemetry for attack rate, wins, dogpiles, drain and stalled actions. |

## Built Phases

### Phase A: Foundation

Adds the `NpcGang` model as a scheduler/profile layer attached one-to-one to a
seasonal `RoundPlayer`.

Delivered:

- `NpcGang` schema and migration.
- Ruleset types for NPC gang profiles and scheduler limits.
- Dev bot seeding that creates starting NPC gang profiles.
- Admin/dev-bot DTO fields for archetype, tier and next action.

### Phase B: Scheduler & Production

Starts the background poller that finds due gangs and lets them make economy
moves.

Delivered:

- `NpcGangService.sweep`.
- Claim-before-run behavior to avoid duplicate actions.
- Ruleset-driven tick timing and max actions per tick.
- Production through the existing production service.

### Phase C: Basic Raids

Lets NPC gangs perform conservative same-city raids against human players.

Delivered:

- Uses existing `CombatService.raid`.
- Avoids NPC-vs-NPC targets.
- Respects active accounts, protection, cooldowns and recent NPC dogpiling.
- Records last intent, outcome, target and deltas in gang memory.

### Phase D: Special Raids

Adds the old-school raid forms to NPC behavior.

Delivered:

- `DRUG_HOES`.
- `STEAL_RIDE`.
- `LURE_CREW`.
- Target suitability checks so the gang only tries moves with something to gain.
- Existing reports, alerts and cooldowns stay authoritative.

### Phase E: Drive-Bys

Adds high-danger drive-by behavior.

Delivered:

- Requires high aggression, rides, fit shooters and turn budget.
- Uses existing drive-by protection and cooldowns.
- Falls back to less violent actions if no valid target exists.

### Phase F: Restock & Shopping

NPC gangs buy condoms, beer, medicine, weapons, Low-Riders and product when they
are short, instead of only spending what they spawned with.

Delivered:

- Buys Low-Riders for drive-by capacity.
- Buys pistols to arm available thugs.
- Buys medicine for wounded crews.
- Buys beer, crack and condoms for lure/drug/supply loops.
- Uses existing store trade, pricing, stock, ledger and idempotency behavior.

### Phase G: Smarter Intent System

Gangs choose weighted priorities by archetype: growers produce more, hitters raid
more, car crews drive-by more, and manipulators lure or drug more.

Delivered:

- Archetype bias for stash builders, muscle crews, ride crews, desperate locals
  and balanced crews.
- Tier bias so stronger gangs act more boldly.
- Trait-driven weights using aggression, ambition and discipline.
- Seeded random choice so outcomes are varied but testable.

### Phase H: Player-Facing Intel

Shows hints that an NPC gang is active nearby: rumors, recent hits, "crew seen
cruising" style chatter and city danger level.

Delivered:

- City-local NPC pressure display.
- Quiet, active and hot danger states.
- Recent NPC hits, drive-bys and special raid counts.
- Fuzzy rumor text that tells players what kind of trouble is nearby without
  exposing perfect internals.

### Phase I: Retaliation Memory

NPC gangs remember the humans who hit them and can hit back inside a limited
window, through the same safety rules as every other NPC hit.

Delivered:

- Grudges rebuilt each tick from `RaidBattle` rows (human hits on the gang inside
  `npcGangs.retaliationHours`), cached in `NpcGang.memory.grudges` with hit
  count, last hit, expiry and settled state. Lost memory heals on the next tick.
- A grudge settles when the gang lands a payback after that attacker's latest
  hit; hitting the gang again reopens it.
- A valid grudge lifts the gang's aggression by `revengeAggressionBoost` and adds
  `revengeIntentBonus` to raid, drive-by and special-raid weights. While one is
  valid, attack moves only look at remembered crews; ordinary targets wait.
- Revenge targets pass the same checks as ordinary NPC targets: newcomer and raid
  protection, drive-by cool-off, "not back since the last hit", same round and
  city, active account and the NPC anti-dogpile window. NPC payback never takes
  the player-side `bypassProtection` revenge pass. The combat engine still owns
  final legality and stamps `retaliation` on the attacker report.
- Defender reports and activity carry `payback`, so players read "as payback"
  and "You hit them first" on raids, drive-bys and special raids.
- Street rumors warn when a local crew you hit still wants payback, with a
  "Payback risk" row showing when the last grudge cools.
- Admin: open grudges and 24h paybacks in the summary, per-city payback counts,
  and per-gang grudge lists with expiry and last payback.

### Phase J: Turf Behavior

NPC gangs hold blocks the way human crews do, through the same turf actions.
NPC-held turf is ordinary turf: the gang is the block's `holderId`.

Delivered:

- **Claim:** ambitious gangs (`npcGangs.turf.minAmbition`) pick a locals-held
  block, Scout it for presence until `turnsToClaim`, then claim it with a squad
  sized to beat the locals. Claims go through `TurfActionService.claim`.
- **Defend:** thin corners are reinforced with `post`. A spotted push gets owner
  backup (Lookouts rules apply, as for players), and in block-war rounds the gang
  sends a squad to each incoming assault and tries to break a siege.
- **Pressure:** human crews with live presence on an NPC block are tried first
  among ordinary raid targets, and raids gain `pressureIntentBonus` while any are
  there. Hits record `onTurf` in gang memory.
- **Abandon:** a gang pulls its whole corner after `abandonAfterLosses` lost fights
  in `lossWindowHours`, when the corner is below minimum and cannot be refilled,
  or when it has no beer and cannot buy any. It then lays off turf for the loss
  window. A gang at war never walks; the war decides the block.
- **Upkeep:** gangs holding corners restock beer and product for
  `supplyHours` of corner upkeep.
- **Limits:** one block per gang and two NPC blocks per city by default, under the
  ruleset's own crew caps. NPCs never push or declare war on a human-held block.
- **Intel:** street rumors name NPC-held blocks and warn when your crew works one;
  a "Crew-held blocks" row shows them. Admin shows held blocks per city, and per
  gang the corner strength, prospect presence, turf strain and last turf move.

### Phase K: Travel & Migration

Stronger gangs move house between cities, so danger zones shift over the season.
A migration is an ordinary `RelocationService.move`: fee, time on the road,
cooldown, the round-end cutoff and every other move check apply.

Delivered:

- **Who moves:** `npcGangs.migration.tiers` (Veteran and Kingpin by default), after
  `minStayHours` in a city, reconsidering every `evaluateEveryHours`.
- **Why:** a hostile city (`hostileLosses` lost fights in the loss window), a
  crowded one (more NPC gangs than its humans support), a quiet one (fewer than
  `quietBelowHumans` active humans), or a clearly richer one (`betterByHumans`
  more active humans).
- **Where:** a reachable, enabled city with enough humans and room. A city carries
  one NPC gang per `humansPerGang` active humans, at least one and at most
  `maxPerCity`, counting crews already on the road. That cap, plus crowded and
  quiet cities pushing gangs out, keeps low-population cities from staying unsafe.
  Room is checked again just before the truck leaves.
- **Packing:** a gang that decides to move goes quiet. It stops raiding, drive-bys
  and turf moves, pulls its corner (a block at war is fought out first), and
  leaves once nobody it hit can still hit back, the same "no running from a fight"
  rule players have. A plan that cannot leave inside `packingHours` is dropped.
- **On the road:** the gang sleeps until its truck arrives. The scheduler settles NPC
  arrivals before each sweep so gangs wake in their new city.
- **Intel:** street rumors announce crews on the road in, fresh arrivals, local crews
  gone quiet to pack and crews that just left; a "Crews inbound" row shows origin
  and arrival time. Crews on the road out no longer count as local.
- **Admin:** gangs packing or moving in the summary, inbound trucks per city, and per
  gang its current city, packing or road status, reason and last move.

Not yet: NPC trade runs ("sending crews") between cities. Runs bring tails,
ambushes and trunk loot, which is its own balance pass.

### Phase L: Escalation & Dormancy

Gangs heat up when they win, cool down when they lose, go to ground when beaten
or over-targeted, and come back on a clean slate. Rules live in
`npcGangs.escalation`; server defaults are in `npc-gang-rules.ts`.

Delivered:

- **Momentum:** rebuilt each tick from the gang's raid battles since it last woke
  (inside `windowHours`), each fight fading on `halfLifeHours`. Wins add
  (`attackWin`, plus `profitBonus` when cash came home), losses subtract, defended
  hits add a little, and each consecutive blocked move costs `blockedPenalty`.
  Capped at plus or minus `maxMomentum`.
- **Escalation:** momentum shifts aggression by `aggressionPerPoint` (capped at
  `maxAggressionShift`) and pacing by up to `maxPaceShift`, so a hot gang reaches
  for violent moves sooner and more often; a cooled one backs off and slows down.
  Traits never change; the shift is applied per tick.
- **Dormancy:** at or below `dormantBelow`, or after `overTargetedHits` human hits in
  `overTargetedHours` (win or lose), the gang pulls its corner and goes to ground for
  `dormantMinHours` to `dormantMaxHours` (deeper holes and over-targeting run
  longest). It uses the existing `NpcGang.dormantUntil`, which the scheduler and intel
  already respect. A gang at war fights it out first; a packing gang just leaves.
- **Recovery:** turns, healing and corner settlement keep running while dormant. On
  waking, fights from before count for nothing, so the gang starts steady, and its
  first move is a restock if it needs one.
- **Intel:** street rumors call out crews on a run, crews licking wounds, and crews
  gone to ground; a "Crew mood" row sums them. Hot crews raise local danger; cooled
  ones lower it.
- **Admin:** gangs on a run and gone to ground in the summary, and per gang its
  mood, momentum, dormancy reason and return time, or when it last woke.

### Phase M: Boss/Archetype Personalities

Gangs run as named crews with recognizable habits. The catalog is authored in
`packages/rulesets/src/npc-gang-personalities.ts` and reaches the scheduler through
`npcGangs.personalities`; a ruleset can add or override personalities by key.

Delivered:

- **Five personalities:** cautious hustlers, violent crew, ride thieves, product
  cooks and ambushers. Each has crew names with tags, a public style line, intent
  biases, a targeting habit, an optional favorite special raid and a squad share.
- **Resolution:** a gang's `archetype` matches a personality key, then an alias
  exactly, then an alias as a substring (so `stash-builder` reads as product cooks),
  then `defaultPersonality`.
- **Behavior signatures:** personality biases replace the old substring archetype
  bias; the favorite special raid is tried first when affordable; ordinary targets
  are ordered by habit (richest, weakest, rides, product, or wounded and unhappy
  crews); squads scale by `squadShare`. Revenge and turf pressure still come first.
- **Identity:** a seeded `crewName`/`crewTag` is kept in memory; otherwise the gang
  id picks one of the personality's names, stable for the season.
- **History:** wins, losses, moves that landed (including corner claims), biggest
  cash hit and last loss, kept in `NpcGang.memory.history`. The last loss is also
  read back from the gang's own fights.
- **Public reputation:** the combat page lists local crews by name and tag, who runs
  them, their style, mood and up to three reputation lines (favorite move, a banded
  recent score, a recent embarrassment, a rough win/loss lean). No exact stats.
  Rumors name the loudest crew.
- **Admin:** crew name, tag, personality and the exact record per gang.
- **Dev bots:** the four seeded crews map to personalities with fixed names, and a
  fifth, Hubcap Hector's Hubcap Kings, is a Veteran ride-thief crew so migration
  has a candidate in dev.

### Phase N: Rewards & Cleanup

Beating NPC crews pays, quiets the city and can break a crew up, with hard caps on
farming. Rules live in `npcGangs.rewards`.

Delivered:

- **Bounties:** a human who beats a *wanted* crew (one that hit a human inside
  `wantedHours`) is paid a house bounty by the crew's tier; holding off a crew's hit
  pays `defenseShare` of it. Caps: `maxPerPlayerPerDay`, one per crew per player
  per `perCrewCooldownHours`, and `maxPerCrewPerDay` across all players. Bounties are
  paid inside the combat transaction and logged in the economy ledger as
  `NPC_BOUNTY` with battle and crew, which is where the caps are read from. Passive
  crews carry no bounty, and over-targeting a crew still sends it to ground
  (Phase L), so a crew cannot be farmed.
- **Reports and activity:** battle reports and activity mark `opponentNpc` and show
  the bounty a win paid; the feed adds it to the line.
- **Contracts:** combat activity now carries `opponentNpc: true` when the other side
  is an NPC crew, so any contract can target NPC crews with an ordinary objective
  `where` (for example `WIN_EVENTS` on `RAID_ATTACK` where `opponentNpc` is true).
  No contract does yet; that is content for the contract boards.
- **City relief:** when humans send a crew to ground (or break it up), every other
  crew in that city stands down from attacks and revenge for `reliefHours`. They still
  restock, produce and work turf.
- **Break-ups:** a crew grounded `retireAfterDormancies` times in a round, or that
  wakes with fewer than `retireBelowThugs` thugs, pulls its corner and breaks up for
  the rest of the round (dormant past the round end, `memory.retired`).
- **Stale cleanup:** the scheduler only loads gangs in active rounds, so crews from
  finished rounds are no longer ticked.
- **Intel:** wanted crews are marked in the local crew list and a rumor names one;
  a "Street relief" row and rumor show who went to ground and how long the quiet
  lasts; recent break-ups make the rumor mill.
- **Admin:** bounties paid in 24h (count and cash), crews broken up, and per gang its
  groundings and break-up reason.

Not done: faction standing for NPC suppression. Standing comes only from Jobs by
design; a Job or contract that targets NPC crews is the way to pay it.

### Phase O: Admin Controls

Operators can correct NPC gangs from Admin → Integrations without database
surgery. Every control needs a reason and writes an `npc-gang.*` audit entry with
before and after.

Delivered:

- **Spawn and remove:** add any one seeded crew to the current round, or remove one
  dev bot, alongside the existing add-all and remove-all. Dev-bot rules still apply:
  refused in production and against a non-local database.
- **Manage panel** per gang (`GET /api/admin/npc-gangs/:roundPlayerId`,
  `POST .../control`):
  - **Act now** runs one normal tick immediately (refused while paused or dormant).
  - **Delay** pushes the next move back 5 minutes to a week.
  - **Pause** for some hours or the rest of the round, on the dormancy clock the
    scheduler already respects, with who, when and why kept in memory.
  - **Wake** ends a pause, a dormancy or a break-up and makes the gang due now; a
    dormancy woken early still gives the clean momentum slate.
  - **Tune** aggression, ambition, discipline, tier and personality (known keys only).
  - **Reset** momentum (earlier fights stop counting), grudges (earlier hits are
    forgotten, via `grudgesClearedAt`) or a migration plan.
- **Inspect:** traits, next move, pause or dormancy, the last 20 decisions (the
  scheduler now keeps `memory.decisions`), the last 10 audit entries for the gang,
  and the raw memory JSON.

Read-only views from earlier phases:

- Read-only admin summary for active gangs, due gangs, 24h actions and blocked
  outcomes.
- Per-city pressure summary with recent hits, drive-bys and special raids.
- Per-bot NPC gang status: next action, last outcome, target and error.
- Per-bot grudge memory with expiry, settled state and last payback (Phase I).
- Per-bot turf: held corners, prospect presence, strain and last turf move (Phase J).
- Per-bot migration: current city, packing or on the road, reason, last move (Phase K).
- Per-bot mood, momentum and dormancy (Phase L).
- CLI status script includes the latest NPC gang outcome.

### Phase P: Balance Telemetry

NPC behavior is measured, and a model predicts it before a season runs.

Delivered:

- **Scheduler counters:** every tick adds to `memory.telemetry.days[YYYY-MM-DD]`: the
  outcome, the error code when a move was blocked (kept apart from choosing to lay
  low), and why targets were passed over (`DOGPILE`, `SHIELD`, `NOT_BACK`,
  `EMPTY_BLOCK`, `NO_MARK`). The last 60 days are kept.
- **Balance report** (`GET /api/admin/npc-gangs/telemetry?window=24h|7d|season`, the
  "NPC balance" panel on Admin → Integrations): NPC hits on humans with win rate and
  hits per active human per day, human hits on NPCs, cash and product taken each way,
  bounties paid, win rates by city, tier and personality, hits by kind, move mix,
  blocked reasons, target skips, and blocked, lay-low and dogpile-skip rates.
- **Model sim** (`npm run qa:npc-gangs`): runs the live weights, pacing, momentum,
  dormancy, break-up and bounty rules for 7 days and a full season in a shared world
  with the anti-dogpile rule, for the roster crews a round of `--humans` would carry
  and for every personality at Scrub, Veteran and Kingpin. Knobs: target odds, win
  rates and human hit rate. It has no economy, so tiers stay where they start.

First reading (10 active humans, defaults): roster crews hit the anti-dogpile cap,
about one NPC hit per active human per day. The cap is the real limiter, so
`retaliationHours` is the main dial for how often NPCs hit people.

## Real Crews

NPC gangs used to exist only as dev bots, which are refused in production and against
any non-local database, so beta never had any. Now the server spawns real crews.

Delivered:

- **Roster:** `NPC_GANG_ROSTER` in `packages/rulesets/src/npc-gang-personalities.ts`,
  ten named crews (boss, crew name and tag, personality, traits), reaching the
  scheduler as `npcGangs.roster`.
- **Spawning:** each sweep checks every active round and spawns at most one missing
  roster crew, no sooner than `spawn.spawnEveryMinutes` after the last, until the round
  carries `minCrews` to `maxCrews` crews (one per `humansPerCrew` humans active inside
  `activeHumanHours`). Dev bots count toward the total. Admin can spawn the next crew
  now. Allowed in production.
- **Spawn small:** a crew joins through `RoundPlayerService.join`, exactly like a new
  player: the round's starting stock, the starting city and the opening rank snapshot.
  It starts at Scrub.
- **Work up:** a new Hustle move scouts the best-paying block the crew can cover,
  keeping turns back for a hit, so crews earn cash and recruit hoes and thugs the way
  players do. Tier follows growth: Street, Veteran and Kingpin at 2×, 5× and 12× the
  crew's starting net worth (`progression.netWorthMultiple`), and only goes up. Higher
  tiers unlock migration and raise bounties.
- **System accounts:** `npc.<slug>` usernames (a dot no human name can use) on an
  `@npc.streets-empire.invalid` address with no usable password, so nobody can sign in
  as a crew and nothing is mailed to one. The admin bot table lists crews alongside dev
  bots; only dev bots can be removed.
- **Fix:** NPC action ids were the gang id plus a UUID, past the shared 64-character
  limit, so combat refused every NPC hit since Phase C. They are now short and tested.

Decided: crews keep ordinary round-player bodies internally so stores, combat,
turf, travel and reports stay in one world, but human-facing standings are
human-only. NPC crews do not take ranking, season-end, Hall of Fame or Discord
role placement from humans.

## Open Balance Questions

- How many NPC hits per active player per day feels exciting instead of annoying?
- Should NPC gangs ever target very new or very inactive players?
- Should NPC gangs become targetable sources of profit, and if so how is farming
  capped?
- How much should hot city pressure influence player travel decisions?
- Should named NPC crews arrive before or after turf integration?
- Do NPC actions need separate public feed language from player attacks?

## Guardrails Before Wider Beta

- Keep anti-dogpile protection strict until telemetry proves it can loosen.
- Never bypass existing combat, store, production, travel or cooldown services.
- Keep player-facing intel fuzzy; reserve exact internals for admin tools.
- Track blocked outcomes closely. A high blocked rate means the scheduler is
  trying actions the world cannot currently support.
- Treat NPC profitability and player damage as season-balance issues, not just
  scheduler issues.

