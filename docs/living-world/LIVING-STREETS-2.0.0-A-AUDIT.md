# Living Streets 2.0.0-A — source audit and story contract

Status: **Slice A implementation / non-active foundation**, branch `feature/living-streets-2.0.0-a`. Follow the [2.0 roadmap](./ROADMAP-2.0.0-LIVING-STREETS-STORIES.md) for B–H. This slice adds **no database migration, scheduler, public route, trigger subscription, or reward writer**. No existing live/pinned round starts stories merely by deploying A.

## Authoritative producer/consumer audit

| Subsystem | Existing source of truth | Reuse / do not duplicate |
| --- | --- | --- |
| City memory | `city-memory.service.ts` / `CityMemoryEvent`, deduped by `idempotencyKey` | Public vs involved-only and verified `takeover`, `war_win`, `business_flip`, `crackdown`, `operation_complete`. A story only references the existing committed memory event. Do not call `emitCityMemoryEvent` again for the invitation. |
| Action encounters | `random-encounter.service.ts`, `random-encounter-choice.service.ts` | Modern `GameEventOccurrence/Participation` and legacy `RandomEncounter` are distinct pinned paths. Subscribe to the **resolved** source receipt only after C; never reroll or claim a choice from story reads. |
| Event lifecycle | `event-lifecycle.service.ts`, `city-condition.service.ts`, `event-system.ts` | Clock sweeps own `COMMUNITY`, `SEASONAL`, `CITY_CONDITION`; encounters own action-triggered expiry. Living Streets adds no fifth scheduler. Reuse `activeRoundEventTime` for active-minute offer deadlines. |
| Black Book | `black-book.service.ts` / `IntelRumor`, `CombatIntel` | Existing source-kind confidence (`contact`, `scout`, `faction_warning`) and owner-only recon. Case clues will reference verified receipts; never republish exact private target stats. |
| Streets Daily | `street-daily.service.ts` / `GameNews.cityMemoryEventId` | Only **public** City Memory drives held drafts; admin publication is explicit and unique by source memory id. A case does not create an alternate news writer. |
| Secret quests | `secret-quest.service.ts` / `PlayerQuest` and existing quest claim | Server-only activity triggers and permanent cosmetic unlocks remain authoritative. A case is an evidence narrative, not a second secret-quest or daily-job board. |
| NPC gangs | `dev-bots.service.ts`, `encounter-gang.service.ts`, turf/combat settlement | Consume committed gang/turf receipts and public intel only. Do not synthesize fights, grants, or source events from a scheduler tick. |
| Player feed | `activity.service.ts` and `in-app-notification.service.ts` | Existing feed/bell/Street Report orchestrates delivery; no duplicate action toasts for a single event. |

## Stable identity and ownership

- Story keys are stable uppercase `STORY_*` identifiers; case keys are stable `CASE_*`. They are **not** database row IDs or public resource discovery endpoints.
- Authored definition owner: optional `Ruleset.livingStories` on a **future pinned ruleset**. No current pinned ruleset adds it. The two starter definitions are explicitly disabled templates.
- Offer uniqueness contract for B: tuple `(ruleset.meta.id, ruleset.meta.version, roundId, sourceKind, sourceId, storyKey, ownerRoundPlayerId)`, encoded as `living-story:` plus SHA-256 of the JSON tuple. Enforce a DB unique index (and transactional source check) when B creates persistence. An offer is player-owned even if its underlying verified city memory is public.
- Only a **server-owned, settled source record** may populate `VerifiedStorySource`. The pure evaluator is not an API permission substitute and must be rechecked under a transaction on acceptance/claim. Never trust a client-supplied actor list, source kind, round, or event ID.
- `ACTORS` invitations require the player's round-scoped actor ID in source actors; `CITY_PLAYERS` must come from a public source in the player's current city. `involved-only` records always reject nonactors; public summaries must never include private evidence.
- Pauses suspend story offers and advancement. Deadlines use **logical active-round timestamps**, not wall time. Source adapters in C must record the active timestamp at settlement using the same pause accounting; otherwise do not offer it.
- Expiry or ignoring an optional story **never** debits cash, turns, crew, inventory or standing. Rewards are zero in A; later slices use the existing reward service and one authoritative claim.
- Never mutate existing historical `Ruleset` objects or replace `classic-og-v1.9-d` under active rounds. B/C will create a new opted-in version and immutable story instance/evidence model.

## Starter verified kinds (blueprints, not live content)

- `STORY_AFTER_THE_SMOKE` → `CASE_THE_FIFTH_WITNESS`; actor-only settled `CityMemoryEvent.kind = war_win` (takeover events have no actor ids).
- `STORY_MISSING_LEDGER` is deferred: `business_flip` has no verified production writer yet. `CASE_MISSING_LEDGER` retains its stable key but may not be offered until Slice C wires a real source.
- Remaining planned cases `CASE_GHOST_SHIPMENT`, `CASE_FALSE_COLORS`, `CASE_MIDNIGHT_SIGNAL` have stable keys but **no invented source mapping** until the C/D audits locate real receipts.

## Gates before Slice B/C

1. Choose a newly pinned ruleset for enabling a validated catalog; no runtime activation in A.
2. Add durable player-owned case/offer rows with owner+round+definition/source uniqueness and source provenance. Verify no client-created case evidence, read-time grants or duplication after retries.
3. On first write, validate source record belongs to the same round/city, is settled, and the event row's visibility and actors are authoritative.
4. Pause/resume, timezone changes, two clients, source retries, combat/economy conservation, historical versions, News editorial privacy and rollback must pass integration tests.
5. Evaluate both actor-only and public-city invitations with seeded NPCs, and verify a player outside the source scope learns nothing about private investigations.

## Slice A verification

```bash
npm run typecheck
npx vitest run packages/rulesets/src/__tests__/living-stories.test.ts apps/server/src/services/__tests__/living-story-contract.service.test.ts
```

Full integration/database and player journey QA belong to B–H. This slice has no end-user case UI by design.
