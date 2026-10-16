# Living Streets 2.0.0-B — Criminal Case Files

**Status:** Foundation code on `feature/living-streets-2.0.0-b`, stacked on `feature/living-streets-2.0.0-a`. B defines records, private APIs, and a trusted receipt collector; real source subscriptions and player UI still belong to C/D/F.

## Data model
- `CriminalCaseFile`: round, player, city and ruleset owner; immutable story/case keys and source provenance, deduplicated offer key, pinned ordered clue/branch snapshot and active-clock deadline.
- `CriminalCaseEvidence`: one audited activity receipt per clue and source kind; unique case+clue, case+source kind, case+receipt. An evidence grant is not a cash/XP grant.
- Statuses: `LOCKED` (catalog/not materialized), `AVAILABLE`, `ACTIVE`, `SOLVED`, `CLOSED`, `EXPIRED`. A clue requires active status and a receipt created after activation. All clues complete in order before `SOLVED`, and the choice is recorded once at `CLOSED`. There is **no cost or penalty** for expiry.
- No rows are created for locked/unrevealed case definitions, so names and objectives cannot leak through the private list.

## Ownership and security
- The only offer constructor, `offerFromCityMemory`, reads a **real stored** `CityMemoryEvent`, pinned round and actor list, then invokes Slice A's verifier. It is internal; **no client POST** creates offers or evidence. It refuses events older than one minute to prevent replay under an incorrect pause offset, and must be called during a trusted settlement transaction by Slice C.
- `recordVerifiedActivity` looks up persisted `PlayerActivity`, verifies ownership, timestamp and event kind, and accepts only the next case clue. Repeated sources or repeat clicks cannot add evidence. This service is not a public endpoint.
- All reads and mutations use player ownership. GET endpoints are private/no-store, do not grant anything and do not write or start events. Transitions lock the case row; concurrent paths share a DB constraint-backed dedup contract.
- No federal-law `PlayerCase` relations or evidence are reused or overwritten; underworld cases are independent narratives. No player target intel is copied into cases or posted publicly.

## Player API (private; inactive until stories can be offered)
- `GET /api/game/case-files`: currently active + archived case DTOs.
- `GET /api/game/case-files/:caseId`: detail for this owner only.
- `POST /api/game/case-files/:caseId/activate`: opt into offered case, server checks round, pause and expiry.
- `POST /api/game/case-files/:caseId/close`: choose one case-defined branch after all clues; no payout yet.
- The endpoints return empty/no-availability for normal current rounds because no existing ruleset enables story invitations. This is **intentional**.

## QA and release
1. Run `npx prisma validate` and `npx prisma migrate deploy` on an isolated migrated Postgres DB.
2. Run `npm run typecheck`, `npx vitest run packages/rulesets/src/__tests__/living-cases.test.ts apps/server/src/services/__tests__/criminal-case-file.service.test.ts`, full CI, and `npm run build`.
3. Replay verified City Memory with repeated retries; the same offer must resolve to the same id. Cross-owner/round/city must be rejected.
4. Retry receipt insertion; a case cannot gain extra clues by repeating one action or inventing an ID. Verify only distinct source kinds in exact clue order count.
5. Test expiry after a pause/restart, rejected branch inputs, old rounds, account deletion cascading cases, and a no-mutation GET.
6. After A merges, retarget B to `beta` (or allow the stack to update), ensure required CI/reviews are clear before merging B. Do **not** deploy un-applied Prisma migrations.

## Future slices
C wires authoritative source receipts into offers; D integrates Scout/Contacts/Travel/encounter evidence; E adds balanced one-time settlements, and F delivers Case Files in the Black Book. The starter-case clue mapping is a prototype; only real verified activity should be hooked up. Never create a second encounter/event scheduler.
