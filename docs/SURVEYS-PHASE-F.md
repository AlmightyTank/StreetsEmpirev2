# Survey System — Phase F Results & Analytics

Phase F turns completed survey submissions into an admin-facing feedback dashboard.
It does not change player rewards or completion rules.

## Admin workflow

Open:

`Admin → Surveys`

Use the survey-list filters to narrow by:

- status;
- release tag;
- feature tag;
- title/description text.

For a LIVE or CLOSED survey, open it and choose **View results**.

## Overview metrics

Each survey results view reports:

- eligible players;
- completed submissions;
- response rate;
- rewards granted;
- first response time;
- latest response time.

Response rate is:

`submissions / eligible accounts × 100`

It is capped naturally by using at least the submission count as the denominator,
so historical account/round cleanup cannot produce a rate above 100%.

### Eligibility denominator

For a round-targeted survey, eligibility counts distinct accounts with a
`RoundPlayer` in that round whose player row existed before the survey stopped
being available.

For a global survey, eligibility counts distinct accounts whose player row
existed before the survey stopped being available and whose round overlapped the
survey's live window.

The live window uses the actual `publishedAt` when available. The end is the
earliest of the survey close time, configured end time, or the current time.

DRAFT and not-yet-open SCHEDULED surveys have no eligible cohort yet.

## Completion trend

Results include a UTC day-by-day completion trend:

- completions that day;
- cumulative completions.

This is descriptive only. It never affects rewards or survey availability.

## Question aggregates

### Yes / No

Shows:

- Yes count and percentage;
- No count and percentage.

### Single choice

Shows each option's:

- response count;
- percentage among respondents who answered that question.

### Multiple choice

Shows each option's count and percentage among respondents who answered the
question.

Because one player may choose several options, multi-select percentages can add
to more than 100%.

### Rating

Shows:

- average rating;
- authored min/max scale;
- count and percentage for each rating value.

Skipped optional ratings are not treated as zero.

### Short / long text

Shows the number of written answers. The full text is browsed separately in the
anonymous response feed.

## Anonymous written-response feed

Admins can:

- search text case-insensitively;
- filter to one short/long-text question;
- page through matching responses.

Every written answer is shown with a chronological survey-local label such as:

`Response #17`

The results API deliberately does **not** return:

- account ID;
- username;
- display name;
- public pimp ID;
- round-player ID;
- submission ID.

The server still retains the internal account/submission relationship required
for duplicate prevention and reward history, but it is not exposed through the
Phase F results contract.

## Search behavior

Search only examines written SHORT_TEXT and LONG_TEXT answer values.

Examples:

- `voucher`
- `mobile`
- `spacing`
- `notifications`

Choice/rating aggregation remains unaffected by the written-response search.

## Reward invariant

Phase F is read-only analytics.

The existing rule remains:

> A player earns the advertised reward by validly completing the survey. Their
> answer, rating, sentiment, criticism or agreement never changes the payout.

## API

Admin-only:

`GET /api/admin/surveys/:surveyId/results`

Query parameters:

- `q` — optional written-response search, max 120 characters;
- `questionId` — optional SHORT_TEXT/LONG_TEXT question filter;
- `page` — 1-based page;
- `pageSize` — 10–100, default 25.

## Tests

Phase F coverage includes:

- choice distribution counts/percentages;
- rating averages with skipped answers excluded;
- a two-player / one-response cohort yielding a 50% response rate;
- written-response search;
- assertions that admin result JSON does not expose account IDs, player IDs or
  usernames.
