# Random Encounters Roadmap

Status: **Phase D complete. Scout, Produce and Travel can roll action-triggered encounters, Scout has player-choice encounters, pending choices are durable/recoverable, latest rulesets use NPC crews as encounter families instead of autonomous actors, and admin telemetry reports encounter rate/impact.**

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

- Converted named NPC roster crews into encounter families across Scout, Produce and Travel.
- Latest ruleset disables autonomous NPC gang spawning/actions while keeping old rulesets and old data intact.
- NPC balance telemetry now includes encounter volume, pending/resolved/expired counts, rate per active human per day and rolled cash/Heat/supply impact.

Next:

- Add more crew-family coverage for Store, Turf and Combat triggers before retiring the old admin NPC controls UI.
- Watch encounter rate and impact data before raising chances or adding sharper downside effects.

## Open Balance Questions

- How often should a player see any encounter during normal play?
- Should first-release encounters ever be harmful, or should risk wait until cooldowns and telemetry exist?
- Which NPC gang names should survive as recurring encounter authors?
- Do city pressure events belong in this system or in a separate city-weather layer?
