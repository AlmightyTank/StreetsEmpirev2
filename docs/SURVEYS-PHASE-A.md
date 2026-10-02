# Survey System — Phase A Foundation

Phase A adds the durable data and shared contracts for StreetsEmpire player
surveys. It deliberately does **not** add routes, reward payout, notifications,
player UI or admin UI yet.

## Core invariant

A survey reward is earned for **completing the survey only**.

The game may validate that required questions were answered and that each answer
has the correct shape for its question, but it must never score sentiment,
wording, positivity, criticism or any other opinion when deciding whether to
grant the advertised reward.

## Data model

- `Survey` — title, description, lifecycle, release/feature tags, optional round,
  schedule and reward definitions.
- `SurveyQuestion` — ordered required/optional question with type-specific
  text/rating constraints.
- `SurveyOption` — ordered choices for single/multiple choice questions.
- `SurveySubmission` — one completed response per account per survey.
- `SurveyAnswer` — typed answer JSON for one question.

### Duplicate reward barrier

`SurveySubmission` has a unique `(surveyId, accountId)` key.

The optional `roundPlayerId` records which round player receives a future
round-scoped payout, but changing round state never makes the account eligible
to complete the same survey again.

## Initial question types

- `YES_NO`
- `SINGLE_CHOICE`
- `MULTIPLE_CHOICE`
- `RATING`
- `SHORT_TEXT`
- `LONG_TEXT`

## Shared submission contract

`surveySubmitSchema` performs transport/shape validation and duplicate question
checks. The future server service performs question-aware validation such as:

- all required questions are present;
- selected option values exist on that question;
- ratings fall inside that question's configured range;
- text obeys that question's configured min/max length.

Those checks determine whether the survey is complete. The answer content itself
does not influence reward eligibility.

## Phase B handoff

Phase B should add the player survey service/API for listing eligible surveys and
loading a survey detail. Submission/reward payout can then be added transactionally
with an idempotency scope such as `SURVEY_COMPLETE:<surveyId>`.
