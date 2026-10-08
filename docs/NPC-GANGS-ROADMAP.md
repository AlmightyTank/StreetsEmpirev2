# NPC Gangs Roadmap

Status: **Phases A-H built in beta. Phase I is next.**

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
| I | Planned | Retaliation memory so NPC gangs remember attackers and can revenge-hit within limits. |
| J | Planned | Turf behavior so NPC gangs claim, defend, pressure or abandon territory. |
| K | Planned | Travel and migration so stronger gangs can relocate or send crews between cities. |
| L | Planned | Escalation and dormancy so gangs heat up, cool down, recover or lay low. |
| M | Planned | Boss and archetype personalities with named gangs and distinct patterns. |
| N | Planned | Rewards and cleanup for beating NPC gangs or relieving city pressure. |
| O | Started | Admin controls for spawning, pausing, dormancy, tuning and memory inspection. |
| P | Started | Balance telemetry for attack rate, wins, dogpiles, drain and stalled actions. |

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

## Remaining Phases

### Phase I: Retaliation Memory

NPC gangs remember who hit them and can revenge-hit within a limited window,
while still respecting protections where needed.

Goals:

- Store recent player attackers in NPC gang memory.
- Weight valid revenge targets above ordinary targets for a short window.
- Respect raid protection, drive-by protection, cooldowns, city rules and active
  round state.
- Add player-facing report language that makes retaliation understandable.
- Add admin visibility for revenge memory and expiry.

Gate:

- An NPC gang can retaliate without bypassing the same safety rules that protect
  players from dogpiling.

### Phase J: Turf Behavior

NPC gangs claim, defend, pressure or abandon turf so they feel like crews holding
territory, not just random attackers.

Goals:

- Define what "NPC-held turf" means using existing turf/block systems.
- Let gangs prefer targets or actions around their turf.
- Let repeated losses or lack of resources make a gang abandon turf.
- Expose turf pressure as city intel rather than exact hidden math.

Gate:

- NPC gangs create recognizable neighborhood pressure without becoming a second
  full PvP map owner system.

### Phase K: Travel & Migration

Stronger NPC gangs can relocate or send crews between cities, creating scav-like
danger zones that shift over time.

Goals:

- Let higher-tier gangs migrate when a city is too quiet, too hostile or too
  profitable elsewhere.
- Respect travel, movement locks and city availability rules.
- Show rumor hints when a crew is seen moving or cruising.
- Keep low-population cities from becoming permanently unsafe.

Gate:

- City danger can move over time, but players can still read and react to it.

### Phase L: Escalation & Dormancy

NPC gangs heat up when successful, cool down after losses, go dormant when
repeatedly beaten, and recover over time.

Goals:

- Increase pressure after wins or profitable runs.
- Reduce pressure after losses, blocked actions or repeated player suppression.
- Use dormancy to cool down gangs that are failing or over-targeted.
- Let dormant gangs recover supplies and re-enter later.

Gate:

- NPC gangs feel reactive instead of ticking forever at one fixed danger level.

### Phase M: Boss/Archetype Personalities

Named gangs get distinct patterns: cautious hustlers, violent crews, ride
thieves, product cooks and ambushers.

Goals:

- Add ruleset-authored gang names, tags and archetype flavor.
- Give named gangs stronger behavior signatures.
- Track lightweight history like biggest hit, last loss or favorite move.
- Keep public identity readable without exposing exact stats.

Gate:

- Players can recognize local crews by behavior and reputation, not just by admin
  data.

### Phase N: Rewards & Cleanup

Beating NPC gangs can grant trophies, contracts, faction standing, bounties or
temporary city relief.

Goals:

- Reward successful suppression without making NPC gangs farmable.
- Consider temporary city relief after a gang is beaten.
- Hook into contracts or faction standing when those systems want NPC targets.
- Add cleanup paths for defeated or stale gangs.

Gate:

- Fighting NPC gangs feels worthwhile, but repeated farming is capped.

### Phase O: Admin Controls

Admin panel controls for spawning, pausing, dormancy, tuning aggression,
inspecting memory and forcing next action.

Current support already built:

- Read-only admin summary for active gangs, due gangs, 24h actions and blocked
  outcomes.
- Per-city pressure summary with recent hits, drive-bys and special raids.
- Per-bot NPC gang status: next action, last outcome, target and error.
- CLI status script includes the latest NPC gang outcome.

Future controls:

- Spawn or remove NPC gangs from the admin panel.
- Pause, wake or dormancy-toggle a gang.
- Adjust aggression, ambition, discipline, tier and archetype with audit logs.
- Force or delay next action.
- Inspect memory, retaliation state and recent decision history.

Gate:

- Operators can correct runaway behavior without database surgery.

### Phase P: Balance Telemetry

Track how often NPCs attack, win, dogpile, drain players or stall, so we can tune
them without guessing.

Current support already built:

- Admin summary counts active gangs, due gangs, recent actions and blocked
  outcomes.
- City pressure counts recent hits, drive-bys and special raids.

Future telemetry:

- Track raids per active player per day.
- Track NPC win/loss rates by city, tier and archetype.
- Track cash/product drained from players and earned by NPCs.
- Track dogpile prevention skips.
- Track blocked action reasons separately from normal lay-low behavior.
- Add simulation reports for 7-day and full-season behavior.

Gate:

- We can tune NPC gangs from measured season data instead of vibes.

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

