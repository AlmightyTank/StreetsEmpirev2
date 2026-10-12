# Random Encounters Roadmap

Status: **Phase D complete. Scout, Produce, Travel, Store, Turf and Combat can roll action-triggered encounters. Scout has player-choice encounters, pending choices are durable/recoverable, latest rulesets use NPC crews as encounter families instead of autonomous actors, and admin telemetry reports encounter rate/impact.**

Random Encounters are the replacement path for persistent NPC pressure. Instead of server-run crews acting off-screen, the street reacts when a player takes an ordinary action: scouting, traveling, producing, shopping, working turf or fighting.

## Design Pillars

- **Action-triggered.** Encounters happen as part of a player action, so players see the outcome immediately.
- **Readable.** The receipt names what happened and what changed.
- **Tunable.** Rulesets own trigger chance, eligibility, weights and effects.
- **No silent punishment.** The first slice is upside-only. Risk encounters should ship only with clear receipt language and caps.
- **NPC flavor without fake players.** Named crews and personalities can become encounter authors without needing persistent round-player bodies.

## Phase A: Foundation

Delivered:

- `randomEncounters` ruleset contract.
- Scout trigger support.
- Weighted encounter pick with action-scoped RNG.
- Cash effect settlement inside the existing action pipeline.
- Scout receipt row for the encounter.
- First latest-ruleset encounters: general street tip and low-rent back-room tip.
- Cooldowns backed by recent activity so encounters cannot spam.
- First safe downside encounters: sidewalk shakedown and lookout tax.
- First choice encounter: a corner tip with buy, press and walk-away responses.
- Choice resolution through the normal action pipeline, with cash, net worth, locking and idempotency handled like other gameplay actions.
- `RandomEncounter` table for durable pending/resolved state and cooldowns.
- Dashboard and Console surfacing for pending choices, so a player can answer after navigating away.
- Non-cash effects for Heat and core supplies, with capped losses and receipt rows.

## Next Phases

### Phase B: Scout Risk And Cooldowns

Delivered:

- Safe non-cash Scout risk: supply losses, minor Heat bumps and choice Heat.
- Capped losses for cash and core supplies.
- Receipt coverage for encounter cash, Heat and supply rows.
- Tests for trigger chance misses, trigger cooldowns, per-key cooldowns and district eligibility.
- Tests for pending-choice dashboard recovery, choice expiry and choice effect capping.

Next:

- Watch real encounter frequency once enough playtesting data exists.

### Phase C: Travel Encounters

Delivered:

- Travel trigger support on run launch, drive-on and head-home actions.
- First road encounters: roadside tip, scale-house delay and marked cruiser.
- Travel encounters use the same durable storage, cooldowns and capped effects as Scout/Produce.
- Run launch activity can carry the encounter summary.
- Travel action hints show encounter outcomes immediately after launch/move actions.

Next:

- Add run-specific encounter effects for trunk stock, vehicle damage and escort complications.

### Phase D: NPC Migration

Delivered:

- Converted named NPC roster crews into encounter families across Scout, Produce, Travel, Store, Turf and Combat.
- Latest ruleset disables autonomous NPC gang spawning/actions while keeping old rulesets and old data intact.
- NPC balance telemetry now includes encounter volume, pending/resolved/expired counts, rate per active human per day and rolled cash/Heat/supply impact.

Next:

- Watch encounter rate and impact data before raising chances or adding sharper downside effects.
- Retire the old admin NPC controls UI after playtesting confirms the new trigger coverage.

### 1.8.0-N: Per-Turn Rolls

Before 1.8.0-N, a trigger rolled `chance` once per action, so a 144-turn scout met the street as often as a 5-turn one. Triggers can now set `chanceBasis: 'TURN'`. That rolls each turn spent, stops at the first hit (at most one encounter per action), and comes to `1 - (1 - chance)^turns`.

- Scout 0.6% a turn: 20 turns 11%, 144 turns 58%.
- Produce 0.5% a turn: 20 turns 10%, 144 turns 51%.
- Travel 0.8% a turn: a 10-turn run 8%, a 34-turn run 24%.
- Store, Turf and Combat cost a few fixed turns and keep per-action odds. Cooldowns are unchanged.
- Older rulesets leave `chanceBasis` unset and keep the one-roll behaviour.

## Open Balance Questions

- How often should a player see any encounter during normal play?
- Should first-release encounters ever be harmful, or should risk wait until cooldowns and telemetry exist?
- Which NPC gang names should survive as recurring encounter authors?
- Do city pressure events belong in this system or in a separate city-weather layer?
