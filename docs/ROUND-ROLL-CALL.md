# Round Roll Call — Slice A: Round-Aware Check-Ins

**Status:** Slice A + Slice B implemented together on `feature/round-roll-call-b`, branched from the newer `beta` head. Slice A PR #298 was unmerged when this branch was created.
**Scope:** Attendance ledger, server clock, automatic foreground check-in, bounded gameplay reward catalog, claim receipts and API, migrations, and tests. No final cosmetics, frontend claim interface, or catch-up quests yet.

## Product contract

- The track requires **ceil((round.endsAt - round.startsAt) / 24 hours) - 7** distinct check-in days; never cap it at 21. Negative results clamp to zero (reward track disabled for rounds no longer than seven days).
- Examples: 14-day round → 7 stamps; 21-day → 14; 28-day → 21; 35-day → 28; 42-day → 35.
- Seven missed days are included in the math and may occur anywhere. Progress **never resets** after an absence. Paused time is excluded from eligible round time and does not consume a missed day; extended resumes do not create additional requirements.
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

- Stable catalog key: `round-roll-call-v1`, pinned in `Round.roundLoginRewardVersion` (database default v1) and validated by the server. Claim receipts render from the stored paid JSON, not a replacement catalog. The length of each track is dynamic (round duration less seven days), with the Legendary gameplay tier only in the last position. This is **not** a 21-day cap.
- A normal 28-day round creates 21 tiers with 10 Common, 6 Uncommon, 4 Rare, and 1 Legendary. The 20 non-final tiers have a deliberate mixed order; other lengths deterministically resample that versioned sequence.
- Only pre-approved `CASH`, `TURNS`, and three consumables (beer, condoms, medicine) can be paid. Per-tier hard caps: $5,000, 20 turns, or 30 items. No weapons, exclusive combat upgrades, and no permanent gameplay multiplier.
- The standard 21-tier track totals **$19,150, 74 turns, and 99 consumable items**, plus the future final cosmetic set (not yet awarded). Cash quantities are stored as integer cents.
- `RoundLoginRewardClaim` stores round-player, tier, reward version, rarity, immutable JSON of rewarded items and claimedAt. The unique `(roundPlayerId,tier)` constraint makes double payouts impossible, even with different request IDs.
- Claims use `ActionService.run` (player lock, replay key, round/pause gate, settlement, transaction) and the existing `grantRewards` utility. Attendance stamps never pay automatically.
- The Legendary last-tier **gameplay** reward is a small $5,000 + 15-turn bundle; its permanent shell + crew cosmetic is explicitly deferred to Slice D. Do not grant a shell or crew cosmetic on any earlier tier.
- Cash/item values are initial balance targets; tuning must create a separately registered `round-roll-call-v2` and change the default only for **new rounds**, never silently altering v1 payouts. Unknown catalog versions fail closed.
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


## Slice C — Immersive player calendar (implemented)

- **Placement:** The Round Roll Call calendar is inside the existing **Street Pass** page at \`/game/street-pass#round-roll-call\`, immediately after the Street Pass hero. No extra primary navigation page, modal-on-every-login, or nested tabs.
- **Single source of truth:** \`GET /api/game/round-roll-call\` supplies the total stamps, pause-aware day timing, remaining allowance, and each tier's persisted \`claimed\`/\`claimable\` state. Frontend never infers eligibility from browser date or timezone.
- **Claim controls:** Each earned tier has its own explicit **Claim reward** action; the nearest claimable step is surfaced in a summary row. Requests use a generated actionId retained per tier through uncertain errors; pending requests cannot produce concurrent clicks. Confirmed payouts refresh the board and player resources. Errors retain scroll position and provide retry guidance; no automatic window scroll.
- **Calendar:** Responsive 4/3/2-column card grid for large/medium/mobile viewports; rare and legendary tiers remain distinguishable with text and not color alone. Claimed, ready, paused, and not-yet-earned states are visible; ready counts and missed-day allowance are exposed in an accessible progress summary.
- **Notifications:** A confirmed foreground check-in produces a dismissible, understated shell notice linking to the calendar. The first check-in event survives the initial game-shell mount; background polls, duplicate requests, and browsing the calendar do not raise it. Players keep full control, with no automatic center-screen interruption.
- **Final cosmetic preview:** A compact, token-based matching shell + crew concept card describes the permanent combined set, the final-day completion requirement, and its **Slice D** status. Slice C **does not grant or simulate ownership**.
- **Accessibility and polish:** Full button descriptions, native keyboard navigation, live receipt message after claiming, error recovery, disabled concurrent claims, reduced-motion support, respect for theme tokens, and non-overflow layouts for narrow phones.
- **No server schema or economy change** in C; it consumes the verified A/B endpoints and reward receipt idempotency.

### Verification checklist

1. Log in for the first eligible day: precisely one server stamp, one shell notice, and a claim-ready Common tier.
2. Navigate/refresh/switch tabs and return: no second stamp, calendar still shows claimed receipts and exact balances.
3. Claim any reached tier and verify its state flips to Collected without scrolling the page to the top.
4. Check paused rounds, a missed check-in, late starters, and a track completed exactly on the final eligible day.
5. On a phone-width viewport, reward cards remain accessible without horizontal page overflow or unreachable buttons.
6. On a complete track, final cosmetics still explicitly say **not yet issued** until Slice D's entitlement service exists.
