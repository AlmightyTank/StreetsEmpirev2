# Proposal

## Why

StreetsEmpire beta has breadth (turf, businesses, crew, factions, combat, casinos, quests) but systems do not react to each other in visible ways. Players gain stats, not stories. Competitors (Torn, Gangster Nation) already ship heists, factions, territory, and newspapers as isolated features, so parity is not differentiation.

Opportunity: make the city remember actions and surface them — "Every empire has a story. Build yours." Prototype connected consequences + one memorable operation first, then decide on the rest.

## What Changes

- Emit a single `CityMemoryEvent` from turf takeovers, block-war wins, business flips, and crackdowns. Consumers render banners, faction attitude shifts, and heat modifiers from it.
- Auto-draft Streets Daily / Street Report entries from `CityMemoryEvent` with admin approve/edit, instead of hand-written news only.
- Add multi-stage criminal operations (intel -> crew lock -> execute -> outcome report) reusing scout, crew, vehicles, contacts, combat. Async co-op via invite.
- Preserve seasonal results as read-only Empire Legacy gallery (battles, covers, crew honors, rivalries). Cosmetic only, no power carryover.
- Add Black Book intel view with confidence levels (rumor / confirmed) over scout + faction data. Actions link to investigate / negotiate / reinforce / strike.
- Add career identities (Enforcer, Smuggler, Fixer, Business Boss, Intelligence Broker) as cosmetic titles + filtered contracts. Same core game.
- Add 4-beat origin story for first 15 minutes (contact -> business -> encounter -> career choice) reusing quests + pending encounters.

## Capabilities

### New Capabilities

- `city-memory`: durable memory of district takeovers, war outcomes, and business flips that other systems consume.
- `street-daily`: auto-generated player-visible coverage of major city events with admin moderation.
- `criminal-operations`: multi-stage operations with intel, crew roles, execution, and outcome reports, including async co-op.
- `empire-legacy`: permanent read-only gallery of seasonal accomplishments without competitive carryover.
- `black-book`: uncertain, piece-together rival intelligence with confidence and player decisions.
- `career-identity`: recognizable playstyle identities with titles, contracts, and cosmetics, no balance fork.
- `origin-onboarding`: short playable origin story replacing checklist onboarding for new players.

### Modified Capabilities

None — greenfield specs. Existing `GameNews`, `TurfControlEvent`, `RoundAftermathReport` behavior unchanged.

## Impact

- DB: new `CityMemoryEvent`, `Operation`, `OperationParticipant`, `LegacyEntry`, `IntelRumor`, `PlayerCareer` models in `prisma/schema.prisma`. No changes to money-as-cents or round reset semantics.
- Server: new emitters in `apps/server/src/services/block-war-settle.service.ts`, `turf` services, `business-action.service.ts`; new services `city-memory.service.ts`, `street-daily.service.ts`, `operations.service.ts`, `legacy.service.ts`, `blackbook.service.ts`; routes in `apps/server/src/routes/game.routes.ts` / new `story.routes.ts`.
- Web: `TurfPage.tsx` banners, `NewsPage.tsx` auto filter, new `OperationsPage.tsx`, `BlackBookPage.tsx`, `LegacyPage.tsx` (extends `ProfilePage.tsx` / `HallOfFamePage.tsx`), `GettingStarted.tsx` 4-beat flow.
- Risks: template spam in Daily, intel noise in Black Book, operation balancing. Mitigated by admin approval gate, confidence thresholds, and one-operation prototype scope.
