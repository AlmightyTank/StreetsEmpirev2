# The Missing Line — Slice A: Audit and Contracts

**Status:** complete. No player-facing change. Audited against `beta` with `classic-og-v2.5-a` (2.5.0-A) as the target ruleset. This turns the [Objective and Gameplay Map](./STORY-QUEST-OBJECTIVE-PLAY-MAP.md)'s design candidates into verified contracts for the later [slices](./STORY-QUEST-CAMPAIGN-SLICES.md).

## Tests added

| Test | Runs | Pins |
| --- | --- | --- |
| `apps/server/src/services/__tests__/story-campaign-contracts.test.ts` | `npm test` | Prerequisite AND, branches sharing one follow-up, type-only matching for run/recon/lane events, target-ruleset facts (stores, supply network, runs, contacts, no `ML_` keys yet). |
| `apps/server/src/services/__tests__/story-campaign-evidence.integration.test.ts` | `STORY_INTEGRATION=1` with PostgreSQL | Real `StoreService.trade` / `checkout` rows for Pip and Tommy, run through the real quest matcher, including blocker B1. |

## Blockers

### B1: basket checkout evidence never reaches store-filtered objectives

`StoreService.checkout` (the web store's basket) writes **one** `STORE_BUY`/`STORE_SELL` activity for the whole basket. Its `storeKey`, `item`, `direction`, and `quantity` are inside `lines[]`, and the event type is picked by the basket's net cash. The quest matcher (`packages/rulesets/src/quest-progress.ts`) only matches dot-paths exactly, so:

- `where: { storeKey: 'PIP' }` or `'TOMMY'` never matches a basket, and a mixed basket can report a sale as a `STORE_BUY`;
- `EVENT_SUM` on `quantity` or `totalCents` finds no top-level `quantity` on a basket (it does have `totalCents`).

Single trades (`StoreService.trade`) and special orders write the fields at the top level and match correctly.

This is **live today**: the latest ruleset has 57 store-filtered objectives (Pip/Tommy contact jobs, dailies, weeklies, season contracts, `CREW_BOSS_PATH`) that ignore basket purchases, plus 11 unfiltered store-sum objectives that read basket fields wrong. **Every campaign store objective (M03, M06, M08, M19, S4, S6, S7, S9) is blocked until this is fixed.** The fix belongs in the quest-progress signal (per-line evidence for baskets, without double-counting unfiltered "any store" objectives), not in campaign definitions. It is tracked as its own slice before the pilot (see Slice A2 in the slices doc).

## Decisions

1. **Campaign vs. current story chain:** the campaign is **additive**. `FIRST_NIGHT_OUT` → `PLANT_THE_FLAG` and the E2 specialty starts stay as they are, in line with the conversion audit's rule to keep existing keys, attempts, and pinned rounds. Campaign quests use new `ML_M##_*` / `ML_S##_*` keys, and `ML_M01` has no quest prerequisite. The tutorial overhaul can retire teaching text from the old chain on its own schedule.
2. **Contacts are ruleset-pinned** (`ruleset.contacts`, extended in v1.2-f and v2.4-a), and rep is keyed by a free string (`PlayerReputation.trader`). New contacts go into the new ruleset's `contacts`, never into the global `questContacts`.
   - **`LEDGER` already exists:** Marisol "Ledger" Pike, retired records sergeant, with 12 jobs (case-file / law themed). She fits the campaign's evidence-comparing role well, so the campaign **reuses her**, and campaign prose must match her voice and pronouns (the Spine's S13 line has been fixed).
   - **`MARA_VENN`** is new, added with Act V (Slice I).
   - Mrs. Alvarez, Eli, Mr. Hales and his daughter, the apprentice, and the drivers stay **in-prose characters**, not contacts.
3. **Scene responses get their own table** (Slice B): `QuestSceneResponse` with `@@unique([playerQuestId, sceneKey])`, storing `responseKey` and the time. That gives per-attempt idempotency, a clean read for branch-aware copy (Slice H) and the story archive (Slice J), and it avoids reusing `QuestProgressReceipt.applied`, which records objective deltas. `QUEST_STORY_SCENE` must be added to the Prisma `ActivityType` enum as well as `packages/shared/src/types/api.ts`, so Slice B ships a migration.
4. **Ruleset ids:** follow the repo's letter pattern. Each content slice that changes the catalog extends the previous one with a new id, starting at `classic-og-v2.6-a` for the pilot. Rounds keep the catalog they started with, so a round only gets the acts that existed when it opened. Release notes and the story archive must not promise later acts to old rounds.
5. **Story copy without a lesson:** `QuestStoryDefinition.lesson` and `actionHint` are required strings today, and the quest card always draws a **Lesson / Next move** block (`apps/web/src/pages/QuestPage.tsx`). Slice B makes `lesson` optional in the type. The validator already skips absent fields, so it needs no change. Slice C hides the block when there's no lesson. `actionHint` stays, as the job-specific "next move".
6. **Recon (M13) and supply lanes (S5) can't be required.** M13's required objective is the `raid_report_reviewed` scene, with `COMBAT_RECON` as an optional bonus objective. S5's required objective is the `box_code_examined` scene, with `SUPPLY_LANE_ARRIVED` as an optional bonus.

## Engine behavior verified

| Behavior | Source | Result |
| --- | --- | --- |
| Multiple `QUEST_COMPLETED` prerequisites | `questPrerequisitesMet` uses `.every` | ANDed. M09, M22, and S15 work in any completion order. |
| Branches sharing one follow-up | `questDefinitionProblems`, `resolveQuestBranchForClaim` | Valid when every branch's `followUpKeys` also appear on the quest. The first committed branch locks; claiming without a branch is refused. |
| Follow-ups after a branch claim | `claimRefreshKeys` | Opened from the quest's `followUpKeys` plus anything requiring it, so a shared follow-up opens whichever branch was chosen. |
| Evidence before accepting | Progress applies only to `ACTIVE` / `READY_TO_TURN_IN` attempts; story quests are not auto-accepted | Actions before accepting never count. A run launched before accepting that returns after does count, and that's acceptable. |
| Several leads at once | No active-job limit, only `TRACKED_LIMIT` for tracking | M06–M08 can all be active together. |
| Duplicate events | `QuestProgressReceipt @@unique([playerQuestId, sourceKey])` | One credit per source event per attempt. |
| `contactKey` validation | Not checked by `questDefinitionProblems` | A typo'd contact silently shows no giver. Slice D adds a check that every campaign `contactKey` exists in the ruleset's contacts. |

## Event contracts

| Event | Emitted by | When | Contract for campaign objectives |
| --- | --- | --- | --- |
| `STORE_SELL` / `STORE_BUY` (single trade) | `StoreService.trade` | Every successful trade | Top-level `storeKey` (`PIP`, `TOMMY`, `CORNER`, `CHARLIE`), `itemKey`, `direction`, `quantity`, `totalCents`; Pip products add `product`. **Verified against PostgreSQL.** |
| `STORE_BUY` (special order) | `StoreService.specialOrder` | Every paid special order | Top-level `storeKey`, `itemKey`, `specialOrder: true`; no `quantity`. Counts for an `EVENT_COUNT`, not a quantity sum. |
| `STORE_BUY` / `STORE_SELL` (basket) | `StoreService.checkout` | Every checkout | **B1:** fields only inside `lines[]`; type set by net cash. **Verified against PostgreSQL.** |
| `RUN_RETURNED` | `bringHome` in `run-settle.service.ts` | Every run. `RunStatus` is only `ACTIVE`/`RETURNED`, so incidents, damage, tails, and empty trunks all still return once. | Match on type only. Needs `ruleset.travel.runs` (enabled in v2.5-a), a ready vehicle at home, and real road time; there's no tutorial gate. Emitted-once is already covered by `travel.integration.test.ts`. |
| `COMBAT_RECON` | `CombatService.recon` | A successful recon only | Needs strategy combat, a non-allied rival in the **same city**, and enough turns; the tutorial target only works during *Take a Shot*. Unreliable in quiet rounds, so bonus only (decision 6). |
| `SUPPLY_LANE_ARRIVED` | `SupplyLaneSettleService.settle` | Every lane shipment that lands, including seizures (`delivered: 0`) | Match on type only. Needs `supplyNetwork.enabled` (true in v2.5-a) plus an ordered lane shipment. It's an optional system, so bonus only (decision 6). |
| `QUEST_STORY_SCENE` | — | **Does not exist yet** | Slice B. Payload: `questKey`, `sceneKey`, `responseKey`; objectives filter on `where: { sceneKey }`. |

## Objective Map rows

**Verified** = works on beta today. **Scene** = needs Slice B. **B1** = blocked by the basket fix. **Fallback** = required objective changed per decision 6.

| Row | Evidence | Status |
| --- | --- | --- |
| M01, M02, M05 | Scene | Scene |
| M03 | `STORE_SELL` where `storeKey: PIP` | Verified for single trades; **B1** |
| M04, M07, M16 | `RUN_RETURNED` | Verified |
| M06 | `STORE_BUY`/`STORE_SELL` where `storeKey: PIP` | Verified for single trades; **B1** |
| M08 | `STORE_BUY` where `storeKey: TOMMY` | Verified for single trades; **B1** |
| M09 | 3 × `QUEST_COMPLETED` + scene | Prerequisites verified; Scene |
| M10, M11, M12, M14, M17, M18, M20, M21, M24 | Scene | Scene |
| M13 | Scene required, `COMBAT_RECON` bonus | Fallback; Scene |
| M15 | Scene + turn-in branch | Branches verified; Scene |
| M19 | `STORE_SELL` where `storeKey: PIP` | Verified for single trades; **B1** |
| M22 | Main-chain `QUEST_COMPLETED` + scene | Prerequisites verified; Scene |
| M23, M25 | Turn-in branch, shared follow-up | Verified |
| S1, S2, S3, S8, S11, S13, S14, S15 | Scene (S15 also 2 × `QUEST_COMPLETED`) | Scene |
| S4 | `STORE_BUY`/`STORE_SELL` where `storeKey: PIP` | Verified for single trades; **B1** |
| S5 | Scene required, `SUPPLY_LANE_ARRIVED` bonus | Fallback; Scene |
| S6 | `STORE_SELL` PIP + scene | **B1**; Scene |
| S7, S9 | `STORE_BUY` where `storeKey: TOMMY` | Verified for single trades; **B1** |
| S10 | `RUN_RETURNED` | Verified |
| S12 | `RUN_RETURNED` + scene | Verified; Scene |

## Test environment note

`store.integration.test.ts` and other HTTP-driven integration suites fail with 403 against a fresh database because their fixtures register accounts without a birth date, email verification, or rules acceptance, and the play-access gate (`apps/server/src/plugins/play-access.ts`) blocks them. That predates this work. The Slice A evidence suite calls services directly, so the gate doesn't affect it.
