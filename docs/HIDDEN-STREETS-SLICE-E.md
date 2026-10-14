# Hidden Streets — Slice E: Comedy Collection

Status: implemented for ruleset `classic-og-v1.8-r` (`1.8.0-R`).

Slice E expands the Hidden Streets comedy lane without adding a new scheduler,
new main navigation, or client-side rewards. Content is authored as versioned
ruleset data and uses existing random encounters, SECRET quests, clue
milestones, account cosmetics, and the Profile Discoveries collection.

## Ruleset isolation

- New latest ruleset: `classic-og-v1.8-r` / `1.8.0-R`.
- Base: `classic-og-v1.8-q` / `1.8.0-Q`.
- Prior pinned rounds remain unchanged: Slice E encounter, quest, and cosmetic
  keys are added only in `1.8.0-R`.

## Encounter keys

All player-facing names and copy are original tributes, not copied characters,
logos, lines, costumes, brands, or music from the inspirations.

| Key | Trigger | Role |
| --- | --- | --- |
| `travel-traveling-salesman` | `TRAVEL` | Slice B encounter now also opens the salesman completion secret. |
| `scout-tin-can-golfer` | `SCOUT` | Angry-golfer-style lot encounter with three bounded choices. |
| `scout-junkyard-meteorite` | `SCOUT` | Tall-tale junkyard rock encounter with bounded cost/reward choices. |
| `scout-block-matriarch` | `SCOUT` | Neighborhood elder encounter with advice/help/no-op choices. |
| `store-regional-management` | `STORE` | Absurd store-counter office errand encounter. |

The new entries inherit existing trigger odds, cooldowns, pending-choice expiry,
receipts, and first-class event behavior from the current random encounter
system.

## Secret quest keys

All comedy story state is per-round `PlayerQuest` state. No row exists before a
trigger is satisfied, preserving spoiler privacy.

| Secret key | Trigger source | Clue milestones | Cooldown metadata | Rewards |
| --- | --- | --- | --- | --- |
| `SECRET_TRAVELING_SAMPLE_CASE` | `RUN_LAUNCHED` with `encounter.key=travel-traveling-salesman` | `road_returns`, `road_turns` | 1440 minutes | Cash, `BURNER_PHONE`, `comedy-roadshow-badge` |
| `SECRET_TIN_CAN_GOLFER` | `SCOUT` with `encounter.key=scout-tin-can-golfer` | `read_the_lot` | 720 minutes | Cash, Ace reputation |
| `SECRET_JUNKYARD_STAR` | `SCOUT` with `encounter.key=scout-junkyard-meteorite` | `scrap_followup` | 720 minutes | Cash, `TOMMY_VOUCHER` |
| `SECRET_BLOCK_MATRIARCH` | `SCOUT` with `encounter.key=scout-block-matriarch` | `porch_rounds` | 720 minutes | Cash, `MAMA_ADVICE` |
| `SECRET_REGIONAL_MANAGEMENT` | `STORE_BUY` / `STORE_SELL` with `encounter.key=store-regional-management` | `counter_errands` | 1440 minutes | Cash, Ledger reputation, `comedy-roadshow-frame` |

The Store secret intentionally authors `encounter.key`; the server's existing
secret-trigger aliasing also matches the stored `randomEncounter.key` payload
used by Store/Turf/Combat action logs.

## Permanent cosmetics

Comedy rewards are account-level cosmetics only and grant no competitive power.

| Cosmetic key | Kind | Style key | Source |
| --- | --- | --- | --- |
| `comedy-roadshow-badge` | `TITLE_BADGE` | n/a | `SECRET_TRAVELING_SAMPLE_CASE` |
| `comedy-roadshow-frame` | `PROFILE_FRAME` | `comedy-roadshow-frame` | `SECRET_REGIONAL_MANAGEMENT` |

Duplicate protection uses the existing quest claim idempotency scope plus
`AccountCosmeticUnlock`'s unique `(accountId, key)` upsert with `update: {}`.
`questCosmeticProblems` validates that all authored `COSMETIC_UNLOCK` rewards
exist in the ruleset cosmetic catalog before runtime.

## Reset and display behavior

- Per-round investigations reset with the round because they live in
  `PlayerQuest` rows tied to `RoundPlayer`.
- Earned comedy cosmetics persist across rounds because they live in
  `AccountCosmeticUnlock`.
- Discovered comedy quests appear in the existing Profile Discoveries area.
- `comedy-roadshow-badge` appears in quest awards/title picker.
- `comedy-roadshow-frame` appears in the existing frame picker and public
  profile avatar frame. Its CSS is static and reduced-motion safe by design.

## Verification

- Ruleset tests cover R-only content, Q/prior ruleset isolation, encounter
  choices, clue milestones, cooldown metadata, and cosmetic validation.
- Server tests cover aliased Store encounter discovery and repeated cosmetic
  award upserts.
- Targeted ruleset/server tests and TypeScript checks should pass before this
  slice is considered complete.
