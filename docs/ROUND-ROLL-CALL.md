# Round Roll Call — Slice A: Round-Aware Check-Ins

**Status:** Slice A + Slice B implemented together on `feature/round-roll-call-b`, branched from the newer `beta` head. Slice A PR #298 was unmerged when this branch was created.
**Scope:** Attendance ledger, server clock, automatic foreground check-in, bounded gameplay reward catalog, claim receipts and API, migrations, and tests. No final cosmetics, frontend claim interface, or catch-up quests yet.

## Product contract

- The track requires **ceil((round.endsAt - round.startsAt) / 24 hours) - 7** distinct check-in days; never cap it at 21. Negative results clamp to zero (reward track disabled for rounds no longer than seven days).
- Examples: 14-day round → 7 stamps; 21-day → 14; 28-day → 21; 35-day → 28; 42-day → 35.
- Seven missed days are included in the math and may occur anywhere. Progress **never resets** after an absence.
- A round day starts at `round.startsAt + (dayIndex-1)*24h`. The final window ends at the exact `round.endsAt`. Server time is authoritative; there is no client-timezone or midnight shortcut.
- Only an authenticated account with a RoundPlayer in the current ACTIVE, **unpaused** round can record attendance. The foreground game snapshot performs the authenticated check-in POST. Background dashboard polling never earns a stamp; Slice C will add the visible calendar and claim UI.
- A player can stamp once per round-relative day, up to the final target. A PostgreSQL unique index guards repeated requests and multiple tabs. The round row lock also serializes check-ins with early round closure.
- The ledger is **per RoundPlayer** and disappears only if that RoundPlayer is intentionally deleted. A new round has a new track. Permanent cosmetics will instead live on Account in Slice D.
- A records stamps without paying rewards. B pays each explicitly claimed reward tier with a unique receipt and caps; D grants the final matching shell and crew cosmetic only after completing the full track.

## Endpoints

Under `/api/game`:

- `GET /round-roll-call` — read attendance, 4-rarity catalog, and claims without writing attendance.
- `POST /round-roll-call/check-in` — atomically record today's attendance; repeated calls return `recorded: false`.
- `POST /round-roll-call/claim` with `{ tier, actionId? }` — redeem an earned tier once, with receipt and payout in the same transaction. Gameplay rewards are not paid from the check-in endpoint.

Responses include roundDays, requiredStamps, allowanceDays, roundDay, stamps, checkedInRoundDays, missedCompletedDays, allowanceRemaining, canStillFinish, canCheckInToday, completed, nextDayAt, and roundEndsAt.

A check-in when not ACTIVE, before the start, after the end, or on a round seven days or shorter returns `ROUND_ROLL_CALL_CLOSED`.

## Follow-on slices

- **B — implemented:** Versioned round reward catalog with rarity distribution, value caps, and durable per-step claim receipts.
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

## Slice B — reward economy and persistence (implemented)

- Stable catalog key: `round-roll-call-v1`. The length of each track is dynamic (round duration less seven days), with the Legendary gameplay tier only in the last position. This is **not** a 21-day cap.
- A normal 28-day round creates 21 tiers with 10 Common, 6 Uncommon, 4 Rare, and 1 Legendary. The 20 non-final tiers have a deliberate mixed order; other lengths deterministically resample that versioned sequence.
- Only pre-approved `CASH`, `TURNS`, and three consumables (beer, condoms, medicine) can be paid. Per-tier hard caps: $5,000, 20 turns, or 30 items. No weapons, exclusive combat upgrades, and no permanent gameplay multiplier.
- The standard 21-tier track totals **$19,150, 74 turns, and 99 consumable items**, plus the future final cosmetic set (not yet awarded). Cash quantities are stored as integer cents.
- `RoundLoginRewardClaim` stores round-player, tier, reward version, rarity, immutable JSON of rewarded items and claimedAt. The unique `(roundPlayerId,tier)` constraint makes double payouts impossible, even with different request IDs.
- Claims use `ActionService.run` (player lock, replay key, round/pause gate, settlement, transaction) and the existing `grantRewards` utility. Attendance stamps never pay automatically.
- The Legendary last-tier **gameplay** reward is a small $5,000 + 15-turn bundle; its permanent shell + crew cosmetic is explicitly deferred to Slice D. Do not grant a shell or crew cosmetic on any earlier tier.
- Cash/item values are initial balance targets; tuning must create `round-roll-call-v2` rather than silently changing already-issued v1 payouts.
- Claiming closes with the round as regular in-round rewards do. The permanent cosmetic from D will need its own end-of-round entitlement handling if a fully completed player forgets to claim, without paying expired gameplay rewards.


### 21-stamp reference reward table

| Step | Rarity | Payout |
| ---: | --- | --- |
| 1 | Common | $1,000 |
| 2 | Uncommon | 8 turns |
| 3 | Common | 12 beer |
| 4 | Uncommon | $1,500 |
| 5 | Rare | 20 turns |
| 6 | Common | 12 condoms |
| 7 | Uncommon | 7 medicine |
| 8 | Common | $1,200 |
| 9 | Common | 15 beer |
| 10 | Rare | $3,000 |
| 11 | Common | 4 turns |
| 12 | Uncommon | 8 medicine |
| 13 | Common | 25 condoms |
| 14 | Common | $1,250 |
| 15 | Rare | 15 turns |
| 16 | Common | 15 beer |
| 17 | Uncommon | $2,200 |
| 18 | Common | 5 medicine |
| 19 | Rare | $4,000 |
| 20 | Uncommon | 12 turns |
| 21 | Legendary | $5,000 + 15 turns; **shell + crew cosmetic comes in Slice D** |

### Slice B verification
Run after installing dependencies and generating Prisma:
```bash
npx prisma validate
npm run typecheck
npx vitest run apps/server/src/services/__tests__/round-roll-call*
```
Check both database migrations (A, B) on a clean database before merging.
