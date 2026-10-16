# Round Roll Call — Slice A: Round-Aware Check-Ins

**Status:** Implemented foundation on `feature/round-roll-call-a`, based on `beta`.
**Scope:** Attendance ledger, server clock, endpoints, automatic foreground check-in, database migration, and tests. No payouts, cosmetic unlocks, frontend popups, or catch-up quests yet.

## Product contract

- The track requires **ceil((round.endsAt - round.startsAt) / 24 hours) - 7** distinct check-in days; never cap it at 21. Negative results clamp to zero (reward track disabled for rounds no longer than seven days).
- Examples: 14-day round → 7 stamps; 21-day → 14; 28-day → 21; 35-day → 28; 42-day → 35.
- Seven missed days are included in the math and may occur anywhere. Progress **never resets** after an absence.
- A round day starts at `round.startsAt + (dayIndex-1)*24h`. The final window ends at the exact `round.endsAt`. Server time is authoritative; there is no client-timezone or midnight shortcut.
- Only an authenticated account with a RoundPlayer in the current ACTIVE round can record attendance. The foreground game snapshot performs the authenticated check-in POST. Background dashboard polling never earns a stamp; Slice C will add the visible calendar and claim UI.
- A player can stamp once per round-relative day, up to the final target. A PostgreSQL unique index guards repeated requests and multiple tabs. The round row lock also serializes check-ins with early round closure.
- The ledger is **per RoundPlayer** and disappears only if that RoundPlayer is intentionally deleted. A new round has a new track. Permanent cosmetics will instead live on Account in Slice D.
- No reward or cosmetic is granted in A, even when the final attendance count is reached. B–D will implement rewards, claim receipts, and the final all-or-nothing cosmetic grant.

## Endpoints

Under `/api/game`:

- `GET /round-roll-call` — read the current player's state without writing attendance.
- `POST /round-roll-call/check-in` — atomically record today's attendance; repeated calls return `recorded: false`.

Responses include roundDays, requiredStamps, allowanceDays, roundDay, stamps, checkedInRoundDays, missedCompletedDays, allowanceRemaining, canStillFinish, canCheckInToday, completed, nextDayAt, and roundEndsAt.

A check-in when not ACTIVE, before the start, after the end, or on a round seven days or shorter returns `ROUND_ROLL_CALL_CLOSED`.

## Follow-on slices

- **B:** Versioned round reward catalog with rarity distribution, value caps, and durable per-stamp claim receipts.
- **C:** Reward calendar, claim interactions, progress visibility, notification and celebration UX with no scroll jumps.
- **D:** Permanent combined shell + crew cosmetic set granted **only** when the final reward step is claimed. Reuse AccountCosmeticUnlock and existing theme/crew style catalogs.
- **E:** Auditable, bounded catch-up mechanics and admin tools; preserve the seven-day native attendance allowance.
- **F:** Economy simulation, anti-abuse verification, migration/round-closure tests, mobile accessibility, and release polish.

## Tests and deployment

Run on a checkout of the feature branch:

```bash
npm ci
npm run db:generate
npx prisma validate
npm run typecheck
npx vitest run apps/server/src/services/__tests__/round-roll-call.service.test.ts apps/server/src/services/__tests__/round-roll-call-checkin.test.ts
```

Deploy only after CI and migration validation. `npx prisma migrate deploy` must run on beta before the new API endpoint is exercised. This branch intentionally does not modify existing Street Pass reward behavior.
