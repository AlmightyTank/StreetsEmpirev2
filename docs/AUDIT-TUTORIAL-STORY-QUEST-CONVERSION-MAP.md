# Tutorial & Story Quest Conversion Map

**Slice:** A — audit and system boundary  
**Status:** Audit baseline for the Tutorial & Story Quest Overhaul  
**Date:** 2026-10-20

## 1. Scope and conclusion

This audit covers the shipped seven-step guided tour, the planned **From
Nobody to Boss** journey, the original ten-job opening chain, the Mama/Pip/Tommy
side jobs, the Wheels/Vic/Blocks contact expansions, onboarding state, and the
quest catalog types used for repeatable and seasonal content.

There are currently two overlapping opening experiences:

1. The shipped guided tour in `packages/rulesets/src/tour-campaign.ts`, exposed
   through `OnboardingService` and the web tour overlay.
2. The ten-job story chain in the classic ruleset, later extended by
   `classic-og-v1.6.5-e2` with a renamed capstone and ten specialty starts.

They share real gameplay events and the existing quest/reward pipeline, but
they do not yet share one mission registry or one progression contract. The
conversion should extend the existing onboarding and quest systems; it must not
add a third campaign engine.

### Slice A decision

- The **tutorial** becomes the only authoritative source for teaching and
  gating core mechanics.
- The **story quest catalog** remains the authoritative source for contact
  jobs, narrative outcomes, quest rewards, and repeatable/seasonal work.
- Tutorial completion can unlock access, but tutorial completion or skipping
  must not grant story rewards, competitive resources, or duplicate quest
  rewards.
- Existing quest keys, attempts, claims, receipts, and pinned rulesets remain
  valid. Any conversion of an active round needs an explicit key/evidence map.

## 2. Current system inventory

### 2.1 Guided tour: shipped seven steps

Source: `packages/rulesets/src/tour-campaign.ts` and
`apps/server/src/services/onboarding.service.ts`.

| Current key | Teaches | Current evidence | Current dependency / reward | Conversion |
|---|---|---|---|---|
| `TOUR_FIRST_JOB` | Job board and accepting work | Any `QUEST_ACCEPTED` | First step; cash + Mama rep | **Reuse** as Learn the Streets / Take Your First Job. Keep quest reward semantics. |
| `TOUR_SCOUT` | Turns, scouting, district income | Any `SCOUT` | Follows first job; cash + Mama rep | **Reuse**, with resolved-action evidence and result review. |
| `TOUR_SUPPLIES` | Stores and basic supplies | Named condoms and beer in onboarding service; quest objective is any two `STORE_BUY` events | Follows scout; cash + Pip rep | **Amend** objective and copy to require the two canonical line items. |
| `TOUR_CREW` | Workers versus muscle; recruit/hire | Scout thug payload, store hire, or current thug count above starting count in `tourProgress()`; quest objective only describes scouting | Follows supplies; cash + Tommy rep | **Amend** to one canonical roster-increase evidence contract. |
| `TOUR_COOK` | Production, ingredients, turns, Heat | `PRODUCE_CRACK` only | Follows crew; cash + Pip rep | **Amend** to any eligible starter product in the active ruleset. |
| `TOUR_HIDEOUT` | Seasonal Hideout upgrade | Any `HIDEOUT_UPGRADE` | Follows production; cash + Mama rep | **Reuse/amend** with an attainable starter room and visible fallback. |
| `TOUR_RAID` | Recon and combat risk | Any `RAID_ATTACK`; recon is copy only, not a gate | Follows Hideout; largest cash + Tommy rep | **Move out of core tutorial**. Retain as optional safe combat chapter or story job; do not require real-player PvP for graduation. |

The tour is represented as `TOUR_STEP_KEYS` in
`packages/shared/src/onboarding.ts`. `OnboardingService` derives progress from
the current round player's activity ledger and starting roster. The tour's
`advance-tour` action only changes the display hint; it must never mark an
objective complete or authorize a reward claim. The existing overlay's
`Next`/`Back` behavior therefore remains instructional navigation only.

### 2.2 Planned twelve-mission journey

Source: `docs/ROADMAP-2.0.0-BEGINNER-JOURNEY.md`. This is a target contract,
not a second live campaign.

| Chapter | Missions | Target classification | Current source / migration note |
|---|---|---|---|
| Make Your Mark | Name crew, choose color, create street sign | Tutorial lesson | Crew name and accent already live in `AccountProfile`; custom street sign is new account-level cosmetic state. Existing valid values count, but default accent alone is not proof of deliberate choice. |
| Learn the Streets | Dashboard, first job, scouting | Tutorial lesson | Reuse tour first-job/scout evidence. Dashboard acknowledgement is instructional state, not a quest reward. |
| Build Your Operation | Condoms/beer, crew, starter weapon | Tutorial lesson | Reuse/amend tour supplies and crew; extract weapon teaching from `HEAVY_HANDS` without making the story quest a gate. |
| Grow Your Foundation | Production, Hideout, review the take | Tutorial lesson | Reuse/amend tour production and Hideout. “Read the Take” needs explicit acknowledgement/activity evidence. |
| Taking Control | Safe combat, recon, turf, travel, contacts | Optional tutorial chapter / handoff | Do not require real-player raid, turf claim, costly shipment, or another player's response for core graduation. Link specialty starts to the existing Quest/Contacts board. |

The twelve core missions replace neither `PlayerQuest` nor the quest reward
ledger. They are a proposed chapter/mission view over authoritative action
evidence, with account-level identity state where appropriate.

### 2.3 Original ten-job opening chain

Source: `packages/rulesets/src/classic-og-v0.7-d/story-quests.ts`.

| Order | Key | Current teaching content | Classification | Decision |
|---:|---|---|---|---|
| 1 | `FIRST_NIGHT_OUT` | Scout for 12 turns; optional recruit | Hybrid | Preserve as a Mama story job, but remove required mechanic instruction once the tutorial teaches scouting. Keep reward and follow-up for pinned rounds. |
| 2 | `FRESH_FACES` | Reach 5 workers and 5 thugs | Hybrid | Keep as a story milestone after the operation lesson; do not make it the only explanation of crew roles. |
| 3 | `KEEPING_THEM_HAPPY` | Stock condoms, beer, and crack | Hybrid | Keep the supply premise and rewards; move supply instruction to the tutorial. Review thresholds for a post-tutorial job. |
| 4 | `COOKHOUSE` | Produce 100 crack | Hybrid | Keep Pip's production story; remove tutorial dependency and replace hard-coded product assumptions only in new active rulesets. |
| 5 | `PAYDAY` | Earn $25,000 from Scout trips | Story job | Keep as an economy/contact job. Tutorial may teach how to read income without requiring this job. |
| 6 | `HEAVY_HANDS` | Have 10 fit armed thugs; unlock shotgun access | Hybrid | Keep as a combat readiness story gate where the ruleset needs it; teach equipment separately and verify starter affordability. |
| 7 | `EYES_OPEN` | Recon another player | Hybrid | Keep Tommy's narrative, but provide a safe/consenting practice path for new active rounds. |
| 8 | `COLLECTION_DAY` | Win a raid; E2 changes this to any resolved raid attempt | Hybrid / high-risk story | Keep old definitions pinned. In E2, the resolved-attempt change is safer but still not suitable as a mandatory core tutorial step. |
| 9 | `PACK_YOUR_BAGS` | Launch an intercity run | Hybrid | Keep as Wheels' story introduction; tutorial can explain travel without requiring a costly run. |
| 10 | `PLANT_THE_FLAG` | Successfully claim a city block | Hybrid / capstone | Keep as a story capstone for old campaigns. E2 renames it **First Empire** and opens optional specialty paths; future tutorial graduation should not require turf. |

The chain contains substantial useful narrative and reward progression, but its
original “Lesson N” copy makes it a competing tutorial. In new active content,
retain the contact voice, objective, outcome, and rewards while moving core
mechanic explanation into the tutorial chapter registry.

### 2.4 Contact chains

#### Mama, Pip, and Tommy (`classic-og-v0.7-f/side-quests.ts`)

| Contact | Keys | Classification | Conversion |
|---|---|---|---|
| Mama | `MAMA_RECRUITMENT_DRIVE`, `MAMA_NIGHT_SHIFT`, `MAMA_HOUSE_FULL` | Story jobs | Keep as optional relationship work. Remove “learn the basics” framing; preserve rep, item, and cash rewards. |
| Pip | `PIP_BULK_ORDER`, `PIP_PARTY_FAVORS`, `PIP_MOVE_THE_WEIGHT` | Story jobs | Keep as a production/distribution arc. Correct event/product semantics when touched; do not use it to unlock production. |
| Tommy | `TOMMY_STOCK_THE_CREW`, `TOMMY_TWO_COLLECTIONS`, `TOMMY_PATCH_JOB` | Story jobs | Keep as equipment/combat arc. Safe practice and equipment availability are tutorial/system concerns. |

These are once-only `SIDE` jobs with contact prerequisites and, in places,
contact reputation gates. They are not repeatable contracts.

#### Wheels, Vic, and Blocks (`classic-og-v0.7-l/contact-quests.ts`)

| Contact | Keys | Classification | Conversion |
|---|---|---|---|
| Wheels | `WHEELS_ROAD_TEST`, `WHEELS_HEAVY_HAUL`, `WHEELS_HOME_SAFE` | Story chain | Keep as the travel arc; tutorial teaches travel and risk before offering it. |
| Vic | `VIC_GREASE_THE_WHEEL`, `VIC_PRICE_OF_SILENCE`, `VIC_CLEAN_SLATE` | Story chain | Keep as the Heat arc; tutorial teaches Heat and available mitigation before the first job. |
| Blocks | `BLOCKS_FORTIFY`, `BLOCKS_TAKE_SOMETHING`, `BLOCKS_OUT_OF_TOWN` | Story chain | Keep as turf/territory arc; no core tutorial dependency on claiming or winning PvP. |

All listed expansion jobs are once-only `SIDE` jobs. Their current
prerequisites and contact-reputation gates are story progression, not tutorial
state.

### 2.5 E2 guided campaign and specialty handoff

Source: `packages/rulesets/src/classic-og-v1.6.5-e2/guided-campaign.ts`.

E2 overlays the older catalog rather than replacing the historical definition:

- `COLLECTION_DAY` counts a resolved `RAID_ATTACK`, win or loss.
- `PLANT_THE_FLAG` is presented as **First Empire**, and its follow-ups are ten
  independent specialty starts.
- The specialty starts are `STREET_OPERATOR_PATH`, `BUSINESS_BUILDER_PATH`,
  `CREW_BOSS_PATH`, `ENFORCER_PATH`, `ROAD_BOSS_PATH`, `FIXER_PATH`,
  `UNDERWORLD_NETWORK_PATH`, `HIGH_ROLLER_PATH`, `SUPPLY_BROKER_PATH`, and
  `CAREER_AND_COMMUNITY_PATH`.
- Each specialty start is a once-only `STORY` quest gated by
  `PLANT_THE_FLAG`; matching deeper contact jobs are gated by that specialty.

This is a useful post-graduation handoff model. It should be exposed through
the existing Jobs/Contacts board after the tutorial, not copied into a second
specialty board. The E2 tests explicitly verify that the older pinned
`classic-og-v0.7-d` definitions remain unchanged.

### 2.6 Non-story quest families

The catalog also contains content that is not tutorial-like and should not be
converted by this initiative:

| Family / types | Examples | Classification | Rule |
|---|---|---|---|
| Repeatable contracts | `DAILY`, `WEEKLY`, `CONTRACT`, `CITY_CONTRACT`, `ALLIANCE` | Repeatable contract | Keep their existing attempt, expiry, contribution, and reward rules. They may reference unlocked systems but do not teach the core tutorial. |
| Seasonal work | `SEASON` | Seasonal/event content | Keep season-scoped availability and rewards; never use seasonal completion as the only core tutorial evidence. |
| Events/community | `EVENT` | Seasonal/event content | Keep event lifecycle and dates. Tutorial can link to an event only as optional content. |
| Secrets | `SECRET` | Story/optional content | Keep discovery and availability semantics; do not surface as mandatory onboarding. |
| Deprecated or unreachable definitions | Any catalog entry failing definition validation or with no reachable follow-up | Obsolete candidate | Do not delete in a pinned ruleset. Mark for retirement only after proving no active player attempt, completion, or reward dependency. |

## 3. Current mechanics taught only by quests

These mechanics currently rely too heavily on quest copy or quest ordering and
must gain tutorial lessons, contextual help, or explicit system unlock text:

1. Dashboard turns, cash, crew, and resource interpretation.
2. Accepting/tracking/claiming a job.
3. Scouting, turn cost, district choice, and reading the result.
4. Supply purpose and canonical line-item purchases.
5. Worker versus thug roles and recruit versus hire paths.
6. Weapon acquisition, equip/readiness, and starter coverage.
7. Production inputs, eligible products, output, and Heat.
8. Hideout seasonal scope, room prerequisites, cost, and attainable starter path.
9. Heat, mitigation, and the difference between pressure and a story reward.
10. Recon, raid risk, and safe combat practice.
11. Travel/run cost, return state, and road risk.
12. Turf inspection, claiming, defending, and the fact that a cosmetic street
    sign is not territory ownership.
13. Contacts, reputation, follow-ups, specialty paths, and the difference
    between a locked story job and a locked system.

After Slice B–D, a story job may give concise job-specific instructions, but
its completion must not be the first place a player has to learn a core rule.

## 4. Canonical state boundaries

| State | Canonical storage/evidence | Scope | Meaning |
|---|---|---|---|
| Identity and tutorial preference | `AccountProfile.onboarding`; existing profile fields such as `crewName` and `profileAccent` | Account | Intro seen/skipped, guide/tour dismissed, display hint, and durable identity. No round cash or quest reward belongs here. |
| Tutorial action progress | Authoritative round actions in `PlayerActivity`, plus validated current round state where needed (for example starting thug count) | Round/player | Whether the player actually performed a lesson action. It is derived, not forged by a UI click. |
| Tutorial mission/chapter status | New versioned tutorial registry/state contract built on the existing onboarding service; skipped status records access completion without gameplay reward | Account preference + round evidence | A chapter can be complete, skipped, active, or replayed for instruction. It must distinguish instructional replay from reward eligibility. |
| Story quest attempt | `PlayerQuest` | Round/player/attempt | Accepted, active, ready, claimed, expired, abandoned, and chosen branch state, including objective and bonus progress. |
| Story progress idempotency | `QuestProgressReceipt` keyed by player quest and source event | Round/player quest | Prevents duplicate application of a source event and provides an audit trail for migration/reward integrity. |
| Gameplay action ledger | `PlayerActivity` | Round/player | Source of real gameplay evidence used by onboarding and quest progress. |
| Quest definition | `QuestDefinition` selected by ruleset id/version/key | Pinned ruleset | Immutable historical meaning for old rounds; new rounds may use amended definitions under a new ruleset/version. |
| Unlock/access state | Existing quest prerequisites plus server-side authorization for the relevant feature | Round/system | Must agree with UI visibility and tutorial chapter status. A hidden tab is not a server gate. |

The critical rule is that account-level “done” cannot substitute for round-level
action evidence. A veteran may skip a chapter after meeting the documented
milestone, but the skip grants access/lesson completion only. It does not copy
cash, rep, items, combat results, or story claims into the new round.

## 5. Migration and compatibility map

### Existing players and new active rounds

1. Keep old ruleset definitions and old quest keys unchanged for pinned rounds.
2. For a new active ruleset, map old tour evidence to equivalent tutorial
   missions where the ledger proves it:
   - `QUEST_ACCEPTED` → Take Your First Job.
   - resolved `SCOUT` → Hit the Streets.
   - named condoms + beer purchases → Keep Them Working.
   - validated recruit/hire or roster increase → Build Your Crew.
   - eligible product production → Make Your Own Product.
   - `HIDEOUT_UPGRADE` → Build the Base.
3. Do not infer a deliberate accent choice from the default accent. Do not infer
   a street sign from a turf claim or from a crew name.
4. A completed old story quest may provide a fair skip milestone only when its
   objective or authoritative activity proves the equivalent action. Otherwise
   offer a visible skip/refresher path without inventing history.
5. Preserve active `PlayerQuest` attempts, objective progress, branch choices,
   completion/claim timestamps, reward state, and receipts. Never replay a
   claimed reward because a quest was reclassified from hybrid to story job.
6. For a job moved from tutorial-like to story-only, retain the old key and
   reward behavior in pinned rounds. New rounds use the converted definition or
   a new versioned key only when a prerequisite/reward meaning changes.
7. Make all migration writes idempotent and race-safe. The existing unique
   reward/progress mechanisms and `QuestProgressReceipt` pattern are the
   integrity baseline.

### Required migration report

Before release, produce per account/round counts for:

- completed, claimed, active, abandoned, and expired tutorial-like quests;
- equivalent tutorial evidence found or not found;
- tutorial chapters marked completed, skipped, or needing refresher;
- rewards already claimed and rewards intentionally not reissued;
- unresolved manual-review cases.

No migration should reset a player's quest board, remove a historical reward,
or grant a new competitive advantage for skipping.

## 6. Target conversion map

| Current content | Target home | Action |
|---|---|---|
| Seven tour steps 1–6 | Tutorial chapters 2–4 | Reuse definitions/evidence, then normalize under one chapter registry. |
| Seven tour raid step | Optional Chapter 5 / combat story | Retire as a core graduation requirement; preserve old-round behavior. |
| Identity setup | Tutorial Chapter 1 | Add explicit account-level street-sign DTO and deliberate color-choice evidence. |
| Ten-job opening chain | Contact-led story arc after tutorial | Preserve narrative, follow-ups, rewards, and useful milestones; remove core mechanic teaching and unsafe mandatory requirements in new rounds. |
| Mama/Pip/Tommy side jobs | Optional contact arcs | Keep as story jobs; audit thresholds and event/product predicates during conversion. |
| Wheels/Vic/Blocks expansions | Optional specialty/contact arcs | Keep chain and reputation gates; tutorial teaches the prerequisite mechanics first. |
| E2 specialty starts | Post-graduation handoff on existing board | Reuse the capstone handoff pattern; do not build a competing board. |
| Daily/weekly/contracts/alliance/city/season/event/secret families | Existing quest systems | Leave outside core tutorial conversion; validate independently. |
| Broken/unreachable/obsolete content | Versioned retirement queue | Disable only in future rulesets after active-progress and reward audit. |

## 7. Risks and acceptance checks

### Highest risks

- Two sources can disagree about completion: generic quest objectives versus
  item-specific onboarding SQL.
- Product events currently use `PRODUCE_CRACK` even when the payload names other
  product types.
- Crew copy promises scout-or-hire while the quest objective historically only
  tracked scout recruitment.
- A real raid, turf claim, shipment, or another player's response can strand a
  player and is unsuitable as a mandatory core lesson.
- Account-level onboarding state can accidentally be treated as round gameplay
  progress across season changes.
- Reclassifying a quest without preserving attempts and receipts can duplicate
  rewards or strand follow-ups.

### Slice A acceptance checklist

- [x] Guided tour, planned journey, tutorial-like opening quests, and contact
  chains inventoried.
- [x] Content classified as tutorial lesson, story job, hybrid, repeatable
  contract, seasonal/event, or obsolete candidate.
- [x] Prerequisites, rewards, branches/follow-ups, activity evidence, and
  completion storage identified.
- [x] Mechanics currently taught only by quests listed for tutorial extraction.
- [x] Canonical account, round, quest, activity, and unlock boundaries defined.
- [x] Pinned-round preservation and migration rules documented.
- [ ] Slice B must turn this map into the approved versioned chapter/mission
  registry and exact skip-milestone specification.

## References

- `docs/ROADMAP-TUTORIAL-AND-STORY-QUEST-OVERHAUL.md`
- `docs/ROADMAP-2.0.0-BEGINNER-JOURNEY.md`
- `docs/QUEST-ONBOARDING-OVERHAUL.md`
- `packages/rulesets/src/tour-campaign.ts`
- `packages/shared/src/onboarding.ts`
- `apps/server/src/services/onboarding.service.ts`
- `packages/rulesets/src/classic-og-v0.7-d/story-quests.ts`
- `packages/rulesets/src/classic-og-v0.7-f/side-quests.ts`
- `packages/rulesets/src/classic-og-v0.7-l/contact-quests.ts`
- `packages/rulesets/src/classic-og-v1.6.5-e2/guided-campaign.ts`
- `prisma/schema.prisma`
