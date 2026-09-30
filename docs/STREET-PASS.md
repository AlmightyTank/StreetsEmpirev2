# Street Pass

A free reward track that runs alongside every round. Players earn **Street Cred**
by playing normally, fill up 30 tiers and claim a reward at each one. The last
tier is a permanent season cosmetic and badge; everything before it is a real
in-round boost.

Status: step 1 of 5 built (see [Suggested order](#suggested-order)). Item art
for the rewards is in `apps/web/public/items/` (see [ITEM-ART.md](ITEM-ART.md)).

## Decisions

| Question | Decision |
| --- | --- |
| Name | **Street Pass** |
| Price | Free, forever. There is no paid track, now or later. |
| Season | One pass per round (28 days). It resets with the round. |
| How strong | Finishing the pass is a real boost: cash, crew, guns, product and favors. |
| Last tier | A permanent season cosmetic (profile frame) plus a season title badge. |
| Guns | The pass gives the gun itself, never permanent buying access. |

Free forever keeps the roadmap's "never sell" rule intact
([ROADMAP-FUTURE.md](ROADMAP-FUTURE.md), 1.9): nothing in the pass can be bought.

## Earning Street Cred

Cred comes from things players already do. Every number here is a ruleset value
so it can be tuned per round.

| Source | Cred | Notes |
| --- | --- | --- |
| Daily contract completed | 150 | 3 offered per day, so up to 450 a day |
| Weekly contract completed | 750 | 2 offered per week |
| Turns spent on actions | 1 per turn | Capped at 400 a day, reset with the daily contracts |
| Story, side or secret job completed | 200 | One-time jobs only |
| Event or alliance contract completed | 300 | |

Tier costs rise so the early tiers come quickly:

| Tiers | Cred per tier | Running total |
| --- | --- | --- |
| 1–10 | 600 | 6,000 |
| 11–20 | 900 | 15,000 |
| 21–30 | 1,200 | 27,000 |

Expected pace:

- **Active player** (all dailies, both weeklies, turns cap most days): about
  1,050 Cred a day. Tier 10 around day 6, tier 20 around day 14, tier 30
  around day 26.
- **Casual player** (2 dailies, 1 weekly, about 150 turns a day): about 550 a
  day, reaching about tier 20 by the end of the round.

### Late joiners

A player who joins after the round has started earns bonus Cred for the rest of
the round: **+15% for each full week the round had already run when they
joined, up to +45%** (a 28-day round has at most three full weeks behind a
new player). It's a small help, not a full catch-up: an active player who
joins on day 15 earns +30% and reaches about tier 23.

## The track

★ marks milestone tiers, which pay two rewards. Amounts are the starting point
for balance testing, not final.

| Tier | Reward |
| --- | --- |
| 1 | $10,000 |
| 2 | 1,000 condoms |
| 3 | 3 hoes |
| 4 | 25 turns |
| ★ 5 | 25 pistols + 5 thugs |
| 6 | 500 beer |
| 7 | 50 medicine |
| 8 | $25,000 |
| 9 | 250 weed |
| ★ 10 | 3 shotguns + 5 hoes |
| 11 | 40 turns |
| 12 | Street Frenzy |
| 13 | 10 thugs |
| 14 | 150 ecstasy |
| ★ 15 | $50,000 + Tommy Voucher |
| 16 | 8 hoes |
| 17 | Cookhouse Rush |
| 18 | 200 meth |
| 19 | 60 turns |
| ★ 20 | 2 Tek-9s + 1 Low-Rider |
| 21 | $75,000 |
| 22 | 150 cocaine |
| 23 | 2 Burner Phones |
| 24 | 15 thugs |
| ★ 25 | 12 hoes + Doctor Favor |
| 26 | 100 turns |
| 27 | 200 heroin |
| 28 | $100,000 |
| 29 | 2 AK-47s + 1 Low-Rider |
| ★ 30 | Season profile frame + season title badge (both permanent) |

A full pass is worth about **$260,000 cash, 28 hoes, 30 thugs, 225 turns,
2 Low-Riders, 25 pistols, 3 shotguns, 2 Tek-9s, 2 AK-47s**, plus supplies,
product and six favors. For scale, the six weekly contracts pay $40,000–60,000
each, so the pass cash alone is about five weeklies.

### Balance notes

- **Hoes are the strongest reward.** Each is worth $2,000 of net worth and
  earns on every Scout. The 28-hoe total is the first number to tune after a
  test round.
- **Scarce guns matter more than their price.** Tommy restocks only 2 AK-47s
  every 12 hours, so the tier 29 AKs are worth far more than $7,000.
- **Guns without access.** Pass guns can be used and sold like any others, but
  buying more still needs the job unlock. This is how job item rewards already
  work: they add to the gun count and never set the unlock flag.
- **Everyone gets the same track**, so the pass rewards activity and doesn't
  pick winners. No single tier should swing net worth much: the largest cash
  tier (28, $100,000) is about two weekly contracts.

## Claiming

- Reaching a tier makes it **claimable**. Nothing is granted automatically, so
  claiming a tier (the tile flips over) is the payoff moment.
- Claims use a one-time claim record, like store and quest receipts, so a
  double tap or retry can never pay twice.
- **When the round ends**, gameplay rewards can no longer be claimed, since
  standings are frozen. An unclaimed tier 30 cosmetic and badge are granted
  automatically, because they are permanent.

## Season cosmetics

Each round gets its own tier 30 pair, so they become collectible:

- **Title badge**, for example "Street Pass · Season 12" (a `TITLE_BADGE`).
- **Profile frame** in that season's colours (a `PROFILE_FRAME`).

Both use the existing cosmetics system (`COSMETIC_UNLOCK`), which already makes
them permanent on the account. Each season needs its own art for the pass tile.

## Build outline

### Ruleset

A new optional `streetPass` block, so each round pins its own pass the way it
pins everything else:

```ts
streetPass: {
  credPerTier: [{ fromTier: 1, toTier: 10, cred: 600 }, ...],
  sources: { dailyContract: 150, weeklyContract: 750, perTurnSpent: 1, dailyTurnCap: 400, oneTimeJob: 200, eventContract: 300 },
  lateJoin: { bonusPercentPerWeek: 15, maxBonusPercent: 45 },
  tiers: [{ tier: 1, rewards: [{ kind: 'CASH', amount: 1_000_000 }] }, ...],
}
```

Rewards reuse `QuestRewardDefinition`, so labels and granting match jobs.

### Reward types (built in step 1)

Jobs and the pass pay out through one shared service,
`apps/server/src/services/reward-grant.service.ts` (`grantRewards`,
`rewardLabel`, `rewardDto`). Step 1 added what the pass needed:

- **Hoes** (`ITEM` `whores`) and **thugs** (`ITEM` `thugs`). Scouting only
  adds to these counts and happiness is worked out from the totals, so pass
  recruits do the same. The allowed item columns are `ITEM_REWARD_FIELDS` in
  `packages/rulesets/src/street-pass.ts`.
- **`PRODUCT`** rewards for any product in the round's catalog, keyed by
  product key (`WEED`, `METH`...). Crack lives on the player row, so a crack
  reward goes through the player state like the other columns; other products
  are written to their inventory rows.

Jobs can use these too.

### Database

- `StreetPassProgress`: one row per round player, holding Cred earned, Cred
  counted from turns today, and the late-join bonus.
- `StreetPassClaim`: one row per claimed tier, unique on round player and tier.
  This is what stops double claims.

### Earning hooks

- Quest completion (daily, weekly, one-time, event and alliance) adds Cred in
  the same transaction that pays the job.
- Turn-spending actions add Cred up to the daily cap.

### API and page

- `GET /street-pass`: tiers, rewards, current Cred, claimable tiers.
- `POST /street-pass/claim`: claim one tier, with an action id like other
  actions.
- A **Street Pass** page: a horizontal track of `ItemTile`s, claimed tiers
  dimmed, the current tier highlighted and a Cred bar. The nav gets an entry
  and a badge when a tier is claimable.
- Reward-to-art mapping: `CASH`, `TURNS`, `FAVOR_ITEM` keys and product keys
  map directly to `ITEM_ART`. `ITEM` field names (`ak47s`, `lowRiders`,
  `whores`...) need a small field-to-key map. `COSMETIC_UNLOCK` uses the
  season's badge art.

### Suggested order

1. **Done.** Ruleset types (`StreetPassRules`), the Season 1 track and its
   badge and frame (`packages/rulesets/src/street-pass.ts`), tier and
   late-join math, a validator (`streetPassProblems`), the new reward types
   and the shared reward service, with tests. Season 1 isn't attached to any
   ruleset yet: it ships in a new ruleset version (with
   `STREET_PASS_S1_COSMETICS` added to its cosmetics) once steps 2–4 are
   ready, so no live round changes before then.
2. Database tables, Cred hooks and the claim service, with integration tests
   for double claims, the turn cap and round end.
3. API and Street Pass page.
4. Season 1 badge and frame art.
5. A balance run: a simulated active and casual player through a full round.
