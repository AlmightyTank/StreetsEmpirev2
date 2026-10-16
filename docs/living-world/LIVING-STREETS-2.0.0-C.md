# Living Streets 2.0.0-C — Settled story triggers

**Status:** feature branch `feature/living-streets-2.0.0-c`. Stacked after PR #301 (B promotion to `beta`) because the original B PR merged into an already-merged A feature branch rather than into `beta` itself.

## What's live for a future opted-in round
A **new immutable ruleset** `classic-og-v3.0-e` (meta version `3.0.0-E`) inherits 3.0-D gameplay and opts into Living Streets. Existing round ruleset IDs and gameplay remain unchanged. This is StreetsEmpire feature release **2.0.0-C**, independent of the historical ruleset naming.

| Verified producer | City memory kind | Story | Audience |
| --- | --- | --- | --- |
| Block war finishes with participants | `war_win` | After the Smoke → Fifth Witness | First verified actor (automatic) |
| Criminal operation reports | `operation_complete` | Missing Ledger | First verified actor (automatic) |
| NPC gang actually migrates | `npc_gang_migration` | Ghost Shipment | Triggering player (automatic) |
| Road stop incident settled | `supply_road_stop` | Ghost Shipment | Affected player (automatic) |
| Alliance actually takes city control | `takeover` | False Colors | City players, manual opt-in |
| Event-follow-up city condition actually activates | `city_condition_follow_up` | Midnight Signal | City players, manual opt-in |

**Business flips are not claimed as a live story source:** `business_flip` has no verified production emitter yet; actual `operation_complete` is the reliable business-pressure-adjacent source. Broad unrelated city condition reads don't trigger stories; only authoritative event-follow-up activation does.

## Lifetime and caps
- Source provenance stays in `CityMemoryEvent`; unique source ID and actor/visibility are server-sourced, never passed by clients.
- New `happenedAtActive` and `offeredAtActive` fields record the paused-round-adjusted logical clock. Event invitations expire after 12–24 **active** hours depending on pinned definition.
- Only one actor is auto-invited per source, avoiding unsolicited spam and cross-player row-lock deadlocks.
- Global round advisory transaction lock serializes quota checks and insertion. Cap per player per round: **4**. Cap per city per round: **100**. Cap per round: **350**. Owner cooldown: **360 active minutes**.
- Same round/source/owner/story unique dedupe survives retries. Repeated action/replay does not create an additional case or reset a cooldown. No payouts/XP/cosmetic grants in C.
- Public city situations remain **opt-in**. `GET /api/game/case-files/opportunities` returns eligible public titles only, with no read-time writes. `POST /api/game/case-files/opportunities/:memoryId` rechecks owner, city, window, round and quota under the server transaction. Private memory is never a public opportunity.
- The current Case Files UI is still an API-only backend in C. Investigation evidence integrations arrive in D and the Black Book panel in F. This slice adds **no independent scheduler**.

## Verification
Run Prisma migration deploy on an isolated database, workspace typecheck, unit tests including `living-story-trigger.service.test.ts`, integration/build. Verify no current round becomes opted in automatically, actorless takeovers don't accidentally grant cases, expired public opportunities cannot be claimed, the same event doesn't issue multiple offers, caps still hold under concurrency, and city-private investigations never appear in news. Keep rewards strictly at zero until E.

Deployment order: merge B promotion PR to `beta`, then merge this C PR to `beta`, and only then consider creating new 3.0-E-pinned test rounds.
