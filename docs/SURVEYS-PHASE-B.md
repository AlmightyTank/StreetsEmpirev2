# Survey System — Phase B Player Read API

Phase B makes Phase A survey content readable by players. It remains read-only:
there is no submission endpoint and no reward payout yet.

## Endpoints

- `GET /api/game/surveys`
- `GET /api/game/surveys/:surveyId`

Both require a signed-in account that has joined the current round.

## Available survey rules

A survey appears in **Available** only when all of these are true:

1. status is `LIVE`;
2. `startsAt` is null or has arrived;
3. `endsAt` is null or is still in the future;
4. `roundId` is null (global) or matches the current round;
5. the account has not already submitted it.

The server owns these checks. A guessed URL cannot expose draft, scheduled,
expired or another-round survey content.

## Completed history

Completed surveys are loaded from `SurveySubmission`, newest first. A player
may reopen a completed survey even after it closes so the Completed tab remains
useful historical context.

For a round-scoped completion, reward labels use that survey round. For a global
survey completion, the submission's round player is used when available so old
history does not silently relabel rewards against a newer round.

## Survey detail

Questions are returned in `position` order. Choice options are also returned in
`position` order.

Question DTOs carry the Phase A constraints needed by the future form:

- required/optional;
- text min/max length;
- rating min/max;
- ordered options.

## Reward rule

Phase B only displays the advertised reward. It does not inspect answer sentiment
or make any reward decision.

Phase C will own submission validation, one-time transactional completion and
reward payout.
