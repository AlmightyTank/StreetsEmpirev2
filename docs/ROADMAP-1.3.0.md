# StreetsEmpire v1.3.0 - Law Enforcement, Wanted Level & Corruption

## Theme

Expand Heat into a wider law-pressure system without turning punishment into random noise.

Heat remains the immediate action risk players already understand. Law pressure is the longer
shadow cast by noisy work: attention, evidence, warrants, informants and corrupt counterplay.

## 1.3.0-F - Law Pressure Release

**Status:** implemented as pinned ruleset `classic-og-v1.3-f`.

F establishes the stable contract later server and UI slices can persist:

- wanted tiers from Quiet through Most Wanted;
- source-specific attention for street work, product sales, production, turf violence,
  business rackets, convoy hijacks, casino markers and large cash movement;
- evidence pressure that can cross warrant and informant thresholds;
- corruption pricing with a daily cap, so bribery is counterplay rather than immunity;
- pure rules-engine calculations for adding, cooling and pricing law pressure.

### Guardrails

- F does not change 1.2.0-F casino odds, tables, jobs, rewards or status.
- F does not add migrations or live player penalties by itself.
- Historical rulesets have no `law` block and continue to load unchanged.
- Evidence does not decay in the F calculator; later slices must make any evidence reduction
  explicit and auditable.

### Handoff

Later slices can wire this contract into persisted player state, admin tools and player-facing
surfaces. Those slices should reuse the pinned source names and wanted tiers rather than
inventing a second law vocabulary.
