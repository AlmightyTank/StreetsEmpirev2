# Survey System — Phase C Completion & Rewards

Phase C turns the read-only board into a one-time rewarded survey completion
flow.

## Endpoint

- `POST /api/game/surveys/:surveyId/submit`

Body:

```json
{
  "actionId": "client-generated-id",
  "answers": [
    { "questionId": "...", "value": "..." }
  ]
}
```

## Completion rule

The reward is based **only on completing the survey**.

The server validates structure:

- every required question is answered;
- answers belong to this survey;
- yes/no answers are booleans;
- single-choice values are authored options;
- multiple-choice values are authored options;
- ratings are whole numbers inside the authored bounds;
- required text contains at least the configured minimum amount of
  non-whitespace text.

The server does **not** score sentiment, keywords, positivity, criticism,
agreement or disagreement.

For example, both of these are equally valid written answers:

- `I love this change.`
- `I hate this change.`

If the rest of the required survey is complete, both receive the same advertised
reward.

## Default validation limits

When the admin has not configured overrides:

- text minimum: 3 characters;
- short text maximum: 500 characters;
- long text maximum: 5,000 characters;
- rating: 1 through 5.

Transport limits still cap ratings at 1–10 and text at 5,000 characters.

## Atomic payout

Submission uses the existing `ActionService` transaction:

1. lock the current round player;
2. replay an already-seen action id if present;
3. verify the survey is still LIVE, in-window and for this round/global;
4. reject a prior account completion;
5. validate and normalize answers;
6. create `SurveySubmission` + `SurveyAnswer` rows;
7. snapshot the exact advertised reward definition;
8. grant rewards through `grantRewards()`;
9. stamp `rewardGrantedAt`;
10. commit the player state and idempotency receipt.

If any validation or reward grant fails, the transaction rolls back: no answers,
no completion row and no partial reward survive.

## Double-pay protection

There are two independent barriers:

- action idempotency scope: `SURVEY_COMPLETE:<surveyId>`;
- database unique key: `(surveyId, accountId)`.

A network retry with the same action id receives the original result. A fresh
action id after completion receives `SURVEY_ALREADY_COMPLETED`.

## Reward history

The exact reward definition paid is stored in
`SurveySubmission.rewardSnapshot`. Completed history renders this snapshot,
not whatever an admin later changes on the survey.

## Phase D handoff

Phase D can add the player-facing Surveys page/form, Available/Completed tabs,
completion confirmation and navigation/badges. Notifications can then hook into
that UI without changing the completion/payment rules.
