# Survey System — Phase E Admin Builder & Publishing

Phase E gives game admins the content tools needed to create, schedule, publish
and close rewarded player surveys. Results/analytics are intentionally reserved
for Phase F.

## Admin route

- `/game/admin/surveys`

The page is linked from both the Admin sidebar and the main Admin landing page.

## Status workflow

Surveys move through four states:

- **DRAFT** — editable and invisible to players.
- **SCHEDULED** — validated, editable until its future start time.
- **LIVE** — visible and submittable; questions and rewards are locked.
- **CLOSED** — no new submissions; historical responses remain intact.

A draft with a future `startsAt` becomes **SCHEDULED** when an admin publishes
it. A draft with no future start becomes **LIVE** immediately.

Scheduled surveys promote themselves to LIVE when their start time arrives.
LIVE/SCHEDULED surveys close automatically when `endsAt` arrives. Schedule
settlement runs from player survey reads/submission, admin survey reads and the
existing alert collector, so it does not depend on a single browser staying
open.

## Builder

Admins can configure:

- title and description;
- release and feature tags;
- global/current-round scope or a specific current/upcoming round;
- optional start and close times;
- one or more completion rewards;
- ordered questions;
- required/optional questions;
- choice options;
- rating bounds;
- text min/max lengths.

Supported question types remain:

- Yes / No
- Single choice
- Multiple choice
- Rating
- Short text
- Long text

Question order can be moved up/down before the survey goes live.

## Reward safety

The builder uses the same reward kinds as the server payout pipeline:

- CASH
- TURNS
- ITEM
- CONTACT_REP
- PRODUCT
- FAVOR_ITEM
- PERMANENT_UNLOCK
- WEAPON_ACCESS
- COSMETIC_UNLOCK

Admin input rejects non-positive numeric rewards at the API boundary. Before a
survey can be scheduled or published, the server also validates reward keys and
amounts against the target/current round's pinned ruleset using the same
`validateSurveyRewards()` guard used during Phase C payout.

This is defense in depth: bad authored JSON cannot become a negative deduction or
a malformed runtime payout.

A rewarded global survey needs a current round so the reward can be validated.
A survey cannot be published to an ended/archived round.

## Immutability

LIVE and CLOSED surveys cannot be edited.

SCHEDULED surveys may be edited while their start time is still in the future.
Every scheduled edit is revalidated *before* it commits. If its start time has
already arrived, schedule settlement promotes it to LIVE first and the edit is
rejected as locked.

Publishing from the UI first saves the exact editor contents, so unsaved changes
cannot be skipped while an older draft is accidentally published.

## Audit log

Admin actions are written through the existing `AdminAuditService`:

- `survey.create`
- `survey.update`
- `survey.schedule`
- `survey.publish`
- `survey.close`

Closing early requires a reason of at least five characters and stores it on the
audit event.

Automatic clock transitions are system lifecycle events rather than admin
actions; the earlier admin schedule/publish record explains why they occur.

## New-survey notifications

A LIVE survey with `announcedAt = null` is picked up by the existing game alert
collector.

The collector:

1. settles due survey schedules;
2. finds newly-live, still-open surveys;
3. selects eligible round players;
4. creates one durable in-game `GAME_ANNOUNCEMENT` activity/bell item;
5. queues outside announcement alerts using the player's existing push/Discord
   preferences;
6. marks `announcedAt` in the same collector transaction.

The notification links directly to:

`/game/surveys?tab=available&survey=<surveyId>`

Global survey fanout follows the bell's active-round-first rule when an account
also has a registration-round player. Accounts are deduplicated, so one survey
creates one announcement per account.

If there are no eligible players yet, `announcedAt` remains null. This lets a
survey prepared for an upcoming round notify the first eligible cohort once
player rows exist.

The alert collector's existing transaction/advisory-lock behavior plus
`announcedAt` makes the fanout one-time.

## Player reward rule remains unchanged

Phase E does not alter reward eligibility:

> The advertised reward is earned by completing the survey. Answer sentiment,
> positivity, criticism or agreement never changes the payout.

## Phase F handoff

Phase F can now build results and analytics safely on immutable completed survey
definitions:

- completion/eligibility counts;
- response rate;
- choice/rating aggregates;
- anonymous written-response browsing/search;
- release/feature filters;
- export/reporting if desired.
