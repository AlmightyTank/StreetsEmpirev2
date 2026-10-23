# Tutorial Chapter & Unlock Specification

**Slice:** B — tutorial progression and skip rules  
**Status:** Proposed implementation contract for approval  
**Depends on:** `docs/AUDIT-TUTORIAL-STORY-QUEST-CONVERSION-MAP.md`  
**Date:** 2026-10-20

## 1. Purpose and system boundary

This specification extends the existing guided tour and onboarding service into
the **From Nobody to Boss** journey. It does not introduce a second onboarding
store, quest engine, reward ledger, or modal stack.

The existing systems remain the implementation foundations:

- `packages/shared/src/onboarding.ts` owns the versioned DTO and action schema.
- `apps/server/src/services/onboarding.service.ts` owns server-derived progress,
  account preferences, and round-aware state.
- `PlayerActivity` is the authoritative evidence for completed gameplay
  actions.
- `PlayerQuest` and `QuestProgressReceipt` remain authoritative for story quest
  attempts, completion, and rewards.
- `AccountProfile` remains the account-level home for identity and tutorial
  preferences.
- Pinned historical rulesets and their quest definitions are immutable.

Tutorial completion grants **access and instructional state only**. It never
grants cash, items, contact reputation, turns, weapon access, story completion,
or competitive power. Existing tutorial quest rewards remain governed by the
quest pipeline until those quests are converted in a later slice.

## 2. Canonical progression model

### 2.1 Versioned identifiers

The active tutorial needs one registry with stable identifiers:

```text
tutorialVersion: "2.0"
chapters:
  make-your-mark
  learn-the-streets
  build-your-operation
  hold-it-together
  reach-beyond-the-block
  make-your-move
  take-control
```

Each mission has a stable `missionId` and a set of authoritative evidence
requirements. Display copy, mentor, route, and spotlight target are metadata;
they cannot complete a mission.

Recommended mission IDs:

| Chapter | Mission IDs |
|---|---|
| Make Your Mark | `identity.crew-name`, `identity.color`, `identity.street-sign` |
| Learn the Streets | `streets.dashboard`, `streets.first-job`, `streets.scout`, `streets.read-result` |
| Build Your Operation | `operation.supplies`, `operation.crew`, `operation.equipment` |
| Hold It Together | `foundation.production`, `foundation.hideout`, `foundation.read-take` |
| Reach Beyond the Block | `beyond.travel`, `beyond.contacts` |
| Make Your Move | `move.practice-combat`, `move.recon` |
| Take Control | `control.turf`, `control.specialties` |

The first four chapters form the **core guide**. Chapters 5–7 are optional
post-graduation lessons and handoffs; they must not block normal play or core
graduation.

### 2.2 Mission state

The server should expose these states for each mission:

| State | Meaning | Reward/access behavior |
|---|---|---|
| `LOCKED` | Previous chapter/mission or system prerequisite is not met | Show requirement and direct route; no action is blocked unless the feature itself is server-gated. |
| `AVAILABLE` | Player may perform or skip the mission | Show action and, when eligible, `Skip ahead`. |
| `ACTIVE` | Player chose to follow the guide | Persist across refresh, logout, device, and route changes. |
| `COMPLETED` | Authoritative evidence or valid milestone proves it | Unlock next mission; no tutorial reward. |
| `SKIPPED` | Player met the published skip milestone and chose access without instruction | Same access as completed; record reason/evidence, no reward. |
| `REFRESHER` | Completed/skipped mission is being replayed for explanation | Never resets evidence, identity, quest progress, or rewards. |

The persisted tutorial state must distinguish `completed` from `skipped` for
analytics and support, while both satisfy access prerequisites. An instructional
`resumeMission` pointer is only a display preference; the server derives
completion from evidence every time.

### 2.3 Chapter completion

A chapter is complete when all required missions have authoritative completion
or valid skip evidence. Optional missions never prevent core graduation.

Core graduation requires:

1. Make Your Mark's three identity missions, except where an existing valid
   account setting counts under the migration rules below.
2. Learn the Streets' dashboard acknowledgement, first job, scouting, and
   result review.
3. Build Your Operation's supplies, crew, and starter equipment.
4. Hold It Together's production, attainable Hideout upgrade, and take review.

It does **not** require a story quest claim, successful raid, turf claim,
intercity shipment, paid purchase, random recruit, or another player's action.

## 3. Chapter objectives and evidence contract

Evidence names below are logical contracts. The implementation may reuse the
existing activity types and payloads, but must validate payload direction,
quantity, product, and active ruleset rather than treating a button click as
proof.

### Chapter 1 — Make Your Mark

| Mission | Player action | Completion evidence | Skip milestone |
|---|---|---|---|
| Name Your Crew | Save a valid crew name in profile settings | Server-validated `AccountProfile.crewName` | Existing valid crew name |
| Fly Your Colors | Deliberately select and save a supported accent | Versioned color-choice acknowledgement plus valid `profileAccent`; default alone is insufficient | Existing non-default deliberate color choice, or explicit confirmation of the current default after migration prompt |
| Build Your Street Sign | Save text, style, and palette through the sign editor | Versioned account-level street-sign DTO, server-normalized and moderated | Existing valid sign DTO |

The street sign is cosmetic identity only. It cannot claim, rename, or imply
ownership of a city block. The identity chapter completion reveal is cosmetic
and instructional; no real turf is assigned.

### Chapter 2 — Learn the Streets

| Mission | Player action | Completion evidence | Skip milestone |
|---|---|---|---|
| Meet Your Empire | Open the dashboard and acknowledge turns, cash, crew, and resources | Versioned acknowledgement stored as tutorial evidence for the current round | Account has completed a prior equivalent tutorial/orientation and has a prior round with meaningful gameplay evidence |
| Take Your First Job | Accept an eligible contact job | `QUEST_ACCEPTED` for a valid current-round job; the tutorial quest itself is not required | Prior-round `QUEST_ACCEPTED` evidence plus an existing claimed/active job history |
| Hit the Streets | Resolve one Scout action | Current-round `SCOUT` activity with a resolved result | Prior-round resolved `SCOUT` activity |
| Read the Take | Review the resulting cash/turn/resource activity | Explicit acknowledgement after a current-round Scout result is displayed; no profitability requirement | Prior equivalent result-review acknowledgement or multiple prior resolved Scout actions |

`TOUR_FIRST_JOB` and `TOUR_SCOUT` map to the two gameplay missions above. The
old seven-step tour remains readable in pinned rounds; new active rounds use
the chapter registry.

### Chapter 3 — Build Your Operation

| Mission | Player action | Completion evidence | Skip milestone |
|---|---|---|---|
| Keep Them Working | Buy condoms and beer | Validated buy evidence for each required item, including checkout `lines`, `direction: buy`, and quantity > 0 | Prior-round item-specific buys for both items, or current starting inventory explicitly marked as supplied rather than purchased plus an acknowledgement |
| Build Your Crew | Gain one thug by scouting or hiring | A validated thug roster increase from Scout, store hire, or an approved future recruit source; compare against round starting roster | Prior-round validated thug increase or current roster above the recorded starting roster with provenance sufficient for migration |
| Arm Your Muscle | Acquire/equip the starter weapon required by the active ruleset | Canonical inventory/equip event and current valid starter readiness; no hard-coded weapon if the ruleset differs | Prior-round valid equipment event or current valid equipped starter weapon with an explicit acknowledgement |

The supplies mission must not count two arbitrary store buys. The crew mission
must not require a random Scout recruit. Both paths are valid and must remain
valid when a player is unlucky.

### Chapter 4 — Hold It Together

| Mission | Player action | Completion evidence | Skip milestone |
|---|---|---|---|
| Make Your Own Product | Produce one available starter product | Active ruleset product catalog identifies an eligible product; validated resolved production event with matching product type | Prior-round production of an eligible product |
| Build the Base | Upgrade an attainable starter Hideout room | Validated `HIDEOUT_UPGRADE` for a room available to the player; server confirms cost/prerequisites | Prior-round valid Hideout upgrade or current room level above starting level |
| Read the Take | Review income, spent turns, supplies, and next opportunities | Explicit dashboard/activity acknowledgement after Chapter 4 actions | Prior equivalent review evidence plus current chapter completion |

The tutorial must not hard-code `PRODUCE_CRACK` when the active ruleset offers
other starter products. A missing shelf, unavailable ingredient, or unaffordable
Hideout room must produce a useful alternative or assistance path, not a soft
lock.

### Optional Chapter 5 — Reach Beyond the Block

| Mission | Action/evidence | Gate behavior |
|---|---|---|
| Take the Road | Open Travel and review a safe run example, or complete a non-punitive practice flow | Link to Travel; do not require a costly shipment or successful return for core graduation. |
| Find Your People | Review contacts, reputation, and specialty paths | Link to the existing Jobs/Contacts board; do not require another player to accept an invitation. |

### Optional Chapter 6 — Make Your Move

| Mission | Action/evidence | Gate behavior |
|---|---|---|
| First Fight | Resolve the beginner practice target if present and functional | Optional only. If no safe target exists, show the lesson and defer it; never require real-player PvP. |
| Know Your Target | Read a recon report for a safe/consenting target | Optional only. Recon explanation must not require attacking the target. |

### Optional Chapter 7 — Take Control

| Mission | Action/evidence | Gate behavior |
|---|---|---|
| Find Your Turf | Inspect the Turf page and understand claim/defend states | Viewing/acknowledgement only for the tutorial; actual claim remains a story/system action. |
| Choose Your Specialty | Open specialty starts on the existing Quest/Contacts board | E2-style specialty paths open after the tutorial capstone; no independent board. |

## 4. System gates and locked-state contract

Tutorial completion and server authorization must agree. Every gated feature
needs a machine-readable requirement and player-readable explanation.

| System | Opens after | Server authorization | Locked UI must show |
|---|---|---|---|
| Dashboard orientation | Account joins eligible round | Existing round access rules | Nothing blocked; show mission prompt only. |
| Jobs / accepting work | `streets.dashboard` acknowledgement or existing access policy | Existing quest availability and eligibility checks | “Complete Meet Your Empire” with dashboard route if the feature is gated. |
| Scout | `streets.first-job` or existing baseline access | Existing Scout action validation | Required mission, route, and whether a job must be accepted first. |
| Stores | `operation.supplies` | Existing store/shelf/checkout validation | Required supply lesson and item/shelf availability; never promise a sold-out item. |
| Crew hire/recruit | `operation.supplies` and current roster rules | Existing hire/recruit validation | Build Your Crew route and whether Scout or Store is currently available. |
| Equipment | `operation.crew` | Existing inventory/equip validation | Starter weapon requirement, price/availability, and safe alternative if applicable. |
| Production | `operation.equipment` | Existing product, ingredient, turns, and Heat validation | Eligible product and ingredient route; do not reveal a quest-only bypass. |
| Hideout | `foundation.production` | Existing room cost/prerequisite validation | Reachable room, cost, current funds, and next prerequisite. |
| Travel | Core graduation or optional chapter eligibility | Existing travel/run validation | Optional chapter route and risk summary; do not block core play solely for travel. |
| Combat/recon | Core graduation or optional chapter eligibility | Existing target, cooldown, city, roster, and risk validation | Safe practice/recon route; no mandatory non-consensual target. |
| Turf | Core graduation or optional chapter eligibility | Existing claim/defend validation | Inspect route and claim prerequisites; no requirement to claim for tutorial graduation. |
| Specialty jobs | Core graduation / `control.specialties` | Existing quest prerequisites | “Finish the tutorial” or named milestone and direct Quest Board route. |

The implementation must not treat a hidden navigation tab as authorization.
Conversely, a player with existing access must not be trapped behind a tutorial
card: the system may show a refresher while allowing valid gameplay.

## 5. Skip-ahead and return-player rules

### 5.1 Eligibility

`Skip ahead` is available only when the server can identify a published
milestone. Eligibility is based on one or more of:

- validated current or prior-round activity evidence;
- valid persisted account identity state;
- current state that is stronger than the required milestone, such as an
  equipped starter weapon or roster increase;
- a completed equivalent old tutorial quest whose objective proves the action.

It is never based on:

- clicking `Next`, opening a page, or viewing a tooltip;
- a generic quest completion with no relevant objective/evidence;
- an account age or veteran flag alone;
- a default profile value when the mission requires deliberate choice;
- a story reward that implies the mechanic without proving the action.

### 5.2 Skip behavior

When a player skips an eligible mission:

1. The server records `SKIPPED`, the tutorial version, mission ID, timestamp,
   and a non-sensitive evidence category (not raw custom sign text).
2. The next mission becomes available immediately.
3. No cash, items, turns, XP, contact rep, cosmetics, weapon access, quest
   claim, or competitive state is granted.
4. The player may open a refresher later without changing the state.
5. The UI explains “access granted; no reward was issued” where confusion is
   likely.

Skip requests are idempotent. Repeating a skip for the same account, round,
mission, and tutorial version returns the existing state and cannot create a
second completion or reward.

### 5.3 Veterans and returning players

- A player with one or more finished rounds is not auto-interrupted by the
  tutorial offer.
- A returning player sees a compact chapter map with completed, skipped,
  current, and locked missions.
- Existing evidence is evaluated when entering a round, not only at first
  login, so a player is not forced into a blank setup.
- Round-scoped action lessons are re-evaluated for each round. Account-level
  identity and preferences carry across rounds.
- A prior-round completion can qualify a current-round skip, but it does not
  create current-round resources or action history.
- If no proof exists, offer the normal lesson or a clearly labeled optional
  refresher; do not invent completion.

### 5.4 Dismiss, resume, and replay

- **Dismiss/Hide:** hides presentation for the current round; it does not mark
  a mission complete or skip a gate.
- **Resume:** returns to the first incomplete required mission, or to the saved
  instructional pointer if it is still valid.
- **Replay/Refresher:** shows copy, highlight, and route again; it never resets
  identity, evidence, quest attempts, claim state, or rewards.
- **Complete:** is derived from evidence and valid skips; clients cannot submit
  completion directly.
- **Round transition:** account preferences survive; round evidence is scoped to
  the new `RoundPlayer`, with prior evidence used only for documented skip
  eligibility.

## 6. Proposed DTO and action additions

These additions extend `OnboardingStateDto`; they do not replace the existing
intro, page-guide, or legacy seven-step fields until pinned-round compatibility
is retired.

```ts
type TutorialMissionStatus = 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED' | 'REFRESHER';

interface TutorialMissionDto {
  id: string;
  chapterId: string;
  status: TutorialMissionStatus;
  required: boolean;
  evidence: { satisfied: boolean; category: string | null };
  skip: { eligible: boolean; reason: string | null };
  route: string;
}

interface TutorialChapterDto {
  id: string;
  title: string;
  status: 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'COMPLETED';
  required: boolean;
  missions: TutorialMissionDto[];
}

interface TutorialStateDto {
  version: '2.0';
  active: boolean;
  dismissed: boolean;
  graduated: boolean;
  currentChapterId: string | null;
  currentMissionId: string | null;
  chapters: TutorialChapterDto[];
}
```

Recommended actions:

```text
start-tutorial
hide-tutorial
resume-tutorial
skip-tutorial-mission { missionId }
open-tutorial-refresher { missionId }
acknowledge-tutorial-mission { missionId, acknowledgement }
```

`skip-tutorial-mission` and acknowledgement actions must be validated on the
server. A route/spotlight action may update only a display pointer. Keep the
legacy `start-tour`, `advance-tour`, `dismiss-tour`, and `restore-tour` actions
for old rounds and compatibility clients until the active-ruleset migration is
complete.

## 7. Persistence and migration contract

### Account-level

Persist in the existing `AccountProfile.onboarding` JSON, under a versioned
namespace such as `tutorialV2`:

- tutorial version and offer preference;
- chapter/mission `skipped` records and evidence category;
- current instructional pointer;
- hidden/dismissed preference;
- refresher/replay preference.

Do not store raw custom street-sign text in tutorial analytics. The sign itself
belongs to the profile identity schema specified by the identity slice.

### Round-level

Use the current `RoundPlayer`/`PlayerActivity` relationship for action evidence.
If durable per-mission status is needed for audit display, store only derived
status and evidence references; never duplicate the quest reward ledger.

The resolver must use the active round's ruleset when interpreting product,
equipment, store, Hideout, and action payloads. Historical rounds continue to
use the legacy seven-step tour and their pinned quest definitions.

### Existing-player migration

| Existing state/evidence | New state |
|---|---|
| Valid `crewName` | `identity.crew-name` completed |
| Deliberate non-default accent already stored | `identity.color` completed |
| Default accent only | Available with confirmation; not automatically completed |
| Existing valid street-sign DTO | `identity.street-sign` completed |
| Old tour `accept-quest` evidence | `streets.first-job` completed/skippable |
| Old tour `scout` evidence | `streets.scout` completed/skippable |
| Old tour named condom + beer evidence | `operation.supplies` completed/skippable |
| Old tour recruit/hire or proven roster increase | `operation.crew` completed/skippable |
| Old production evidence for active eligible product | `foundation.production` completed/skippable |
| Old Hideout upgrade evidence | `foundation.hideout` completed/skippable |
| Old raid completion only | Optional combat/recon refresher; never core graduation proof |
| Completed story quest with no matching action proof | No invented mission completion; offer skip only if another milestone qualifies |

Migration is read-compatible and idempotent. It must not rewrite old
`PlayerQuest` rows, alter `QuestProgressReceipt`, reissue rewards, or change
the behavior of pinned rulesets.

## 8. Accessibility and mobile requirements

- The tracker is a normal semantic region with a heading, current chapter and
  mission status; completion changes are announced through an accessible live
  region.
- Every mission has a visible text route in addition to spotlight guidance.
- Keyboard users can reach `Resume`, `Hide`, `Skip ahead`, `Why?`, and
  `Refresher`; focus returns to the invoking control after navigation.
- Reduced-motion users receive no required animation or auto-scroll.
- Do not use color alone for locked, active, completed, or skipped states.
- Buttons have comfortable touch targets and retain readable labels at narrow
  widths.
- The tracker is collapsible and must not intercept vertical page scrolling,
  pull-to-refresh, browser gestures, or fixed navigation controls.
- On mobile, `Guide Me` may navigate and scroll once to a real target. It must
  not repeatedly force scroll position while the player swipes or types.
- Spotlight fallback must render if the target is absent, delayed, locked,
  inside a closed panel, or inaccessible; the fallback still exposes the route
  and mission requirement.
- Copy must remain understandable without the spotlight and must not depend on
  hover, animation, or audio.

## 9. Test contract for implementation

Slice C–G implementation and QA should cover at least:

1. New account starts at Make Your Mark and can resume after refresh/logout.
2. Existing valid identity values are counted fairly; default color is not
   silently counted as deliberate selection.
3. Any `Next`/route action cannot create evidence or complete a mission.
4. Supply evidence distinguishes condoms and beer in single-line and
   multi-line checkouts and respects buy direction and quantity.
5. Scout-recruited and store-hired thugs both satisfy the crew mission.
6. Production uses the active ruleset's eligible products.
7. An unlucky Scout run does not block the crew mission.
8. Skip is available only with evidence, is idempotent, and grants no reward.
9. New-round entry preserves account identity but does not copy round
   resources/action history.
10. Old pinned rounds still expose the seven-step tour and unchanged quest
    definitions.
11. A completed story quest is never re-claimed because of migration.
12. Keyboard, screen reader, reduced-motion, narrow phone, and wide desktop
    paths all retain an accessible route to the current mission.

## 10. Slice B approval checklist

- [x] One tutorial system boundary; no competing onboarding or quest engine.
- [x] Chapter and mission IDs defined.
- [x] Required objectives and authoritative evidence defined.
- [x] System gates, server authorization expectations, and locked copy defined.
- [x] Return-player skip eligibility and no-advantage behavior defined.
- [x] Completed, skipped, resumed, dismissed, and refresher behavior defined.
- [x] Account-level versus round-level persistence defined.
- [x] Pinned-round and existing-player migration behavior defined.
- [x] Accessibility and mobile requirements defined.
- [ ] Product/design approval of copy, exact UI shape, and milestone thresholds.
- [ ] Slice C implementation of the approved contract.

## References

- `docs/ROADMAP-TUTORIAL-AND-STORY-QUEST-OVERHAUL.md`
- `docs/ROADMAP-2.0.0-BEGINNER-JOURNEY.md`
- `docs/AUDIT-TUTORIAL-STORY-QUEST-CONVERSION-MAP.md`
- `packages/shared/src/onboarding.ts`
- `apps/server/src/services/onboarding.service.ts`
- `apps/web/src/components/onboarding/TourOverlay.tsx`
- `apps/web/src/components/onboarding/TourOffer.tsx`
- `prisma/schema.prisma`
