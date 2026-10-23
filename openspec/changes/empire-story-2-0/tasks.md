# Tasks

## 1. Backbone city-memory

- [x] 1.1 Add `CityMemoryEvent` Prisma model with idempotency key and verify `prisma validate` passes
- [x] 1.2 Implement `city-memory.service.ts` emit + list with visibility enforcement and verify unit test for takeover emit + no-duplicate retry passes
- [x] 1.3 Wire emit into block-war settle and turf takeover in same transaction (server/web/shared typecheck clean; full `qa:turf` sim still needs a live DB)
- [x] 1.4 Render latest-memory banner from `latestEvent` on `TurfPage.tsx` (typecheck clean; visual check still needs dev round with a takeover)

## 2. Street Daily + Street Report

- [x] 2.1 Add Daily generator producing `GameNews` drafts from public events with per-kind templates and verify one takeover yields exactly one draft
- [x] 2.2 Add admin approve/edit/reject in existing admin news flow and verify rejected draft never publishes
- [x] 2.3 Add `NewsPage.tsx` auto filter + event links and verify reader can open district and participant links
- [x] 2.4 Emit Street Report entries to participants on publish and verify loser gets reinforce-or-retaliate links

## 3. Criminal operations prototype

- [x] 3.1 Add `Operation` + `OperationParticipant` models and deployable migration with intel/crew/execute/report states; state-machine tests reject skip transitions
- [x] 3.2 Implement `operations.service.ts` role lock + async invite via activity notifications; invite accept, pending-readiness, and expiry tests pass
- [x] 3.3 Implement execute using shared deterministic rules primitives and crew-role modifiers plus outcome report + memory event; tests verify both success and complication lines
- [x] 3.4 Add `OperationsPage.tsx` full flow (web/server/shared typechecks and route/nav tests pass; live browser round still requires a migrated dev DB)

## 4. Empire Legacy

- [x] 4.1 Add `LegacyEntry` model + deployable migration + round-close snapshot job; builder/idempotency tests verify winner, public event, and Daily receipts
- [x] 4.2 Add Legacy gallery + immutable profile showcase selection; ownership/feature tests and web/server typechecks pass
- [x] 4.3 Isolate fresh-round resource construction from `LegacyEntry`; regression test verifies identical starting resources

## 5. Black Book

- [x] 5.1 Add `IntelRumor` model + deployable migration with confidence/source/expiry; service test verifies only qualitative bands are stored, never exact enemy numbers
- [x] 5.2 Implement independent-source corroboration + stale-intel cleanup and combat-recon projection; tests verify contact + scout raises confidence one level and expired rows are removed
- [x] 5.3 Add `BlackBookPage.tsx` with investigate/negotiate/reinforce/strike deep links; link test verifies turf city/district preselection and combat target preselection

## 6. Career + origin onboarding

- [x] 6.1 Add `PlayerCareer` model + switch cooldown; regression test verifies career changes never mutate round resources or gameplay math
- [ ] 6.2 Author 4-beat origin `QuestDefinition` chain reusing real scout/business/encounter/career events (catalog test passes; 15-minute live dev timing still required)
- [x] 6.3 Replace `GettingStarted.tsx` checklist with origin runner + career choice; service test verifies exactly four activity-derived beats

## 7. Integration

- [x] 7.1 Run `vitest run`, `typecheck`, `qa:turf`, and Daily generator in draft mode (281 test files / 2,151 tests pass; 102 project-skipped files remain; full workspace typecheck and Turf gates pass; Daily retry creates zero duplicate drafts; Legacy isolation covers fresh-round resources)
- [x] 7.2 Document thresholds and rollout controls in `docs/2.0-STORY-PLAN.md`; documented schema, test, typecheck, Turf, Daily, and strict OpenSpec commands pass (document explicitly records that no runtime story flag exists)
