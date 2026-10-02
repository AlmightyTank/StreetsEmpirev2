# Survey System — Phase D Player Experience

Phase D gives players the complete survey experience on top of the Phase A–C
data, read API and transactional completion flow.

## Player route

- `/game/surveys`

The page is available only to a signed-in player in the current round, matching
the server survey endpoints.

## Navigation

Surveys appears in the **Actions** section beside Quests.

The navigation badge shows the number of currently available surveys. It
refreshes on:

- first game-shell load;
- window focus;
- a survey completion event;
- a two-minute safety interval.

If the survey request fails, navigation keeps working and simply leaves the last
known badge count in place.

On phones, Surveys also appears in the **More** sheet and can be assigned to one
of the four customizable tab-bar slots.

## Available and Completed tabs

**Available** cards show:

- title and description;
- release/feature tags;
- question count;
- close time when present;
- the exact advertised completion reward.

**Completed** cards show:

- when the player submitted;
- the exact saved reward snapshot;
- a button to reopen the completed survey.

Completed detail returns only the signed-in account's own `SurveyAnswer` rows.
No other player's answers are exposed by the player API.

## Question UI

Phase D renders all Phase A question types:

- Yes / No
- Single choice
- Multiple choice
- Rating
- Short text
- Long text

Required and optional questions are labeled explicitly. Text questions show
their character count and configured maximum.

The page mirrors the server's structural checks so players get immediate,
question-specific feedback before a request is sent. Server validation remains
authoritative.

## Reward rule

The page tells players plainly:

> Rewards are based only on completing the survey — never on whether the
> feedback is positive or negative.

The submit confirmation repeats this rule and shows the reward before answers
are made final.

## Safe submission retries

The browser generates one action ID for a submission attempt.

If the response is definitely rejected, that ID is cleared so the player may
correct the form and make a new attempt.

If the connection fails after the request may have reached the server:

1. the current answers are locked;
2. the same action ID is retained;
3. the button becomes **Retry submission**;
4. retry sends the exact same intent;
5. the Phase C idempotency record replays the original result if the first
   request already committed.

A confirmed receipt locks the form immediately, even if the follow-up page
refresh fails.

## Completed response history

Opening a completed survey shows the player's own saved answers as read-only
controls plus the reward snapshot captured when the survey was submitted.

This is personal history only. Aggregate/admin survey analysis belongs to the
later results/admin phase.

## Theme and mobile behavior

Survey styles use StreetsEmpire's existing `--se-accent`,
`--se-accent-rgb`, panel, line, text and status variables, so unlocked player
accent/site themes automatically carry through.

Cards collapse to one column on smaller screens. Choice controls become
single-column where appropriate, and the submit bar stays reachable above the
mobile game tab bar.
