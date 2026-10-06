# Street Pass

A free reward track that runs alongside every round. Players earn **Street Cred**
by playing normally, fill up 30 tiers and claim a reward at each one. The
track mixes in-round boosts with permanent profile cosmetics, including a
theme at tier 15 and a frame at tier 25.

Status: built. Season 1 ships in ruleset `classic-og-street-pass-a` (Trips E
plus the pass); see [Shipping](#shipping). Item art
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
| 1–10 | 800 | 8,000 |
| 11–20 | 1,200 | 20,000 |
| 21–30 | 1,600 | 36,000 |

These were raised from 600 / 900 / 1,200 after the balance run: one-time Jobs
(45 in the round, 200 Cred each) and city contracts (300 each) made the first
costs far too quick. Pace from `npm run qa:street-pass` (see
[Balance](#balance)):

| Player | Tier day 7 | Day 14 | Day 21 | Day 28 | Finishes |
| --- | --- | --- | --- | --- | --- |
| Hardcore (everything, 2 city contracts a day) | 15 | 25 | 30 | 30 | day 18 |
| Active (all dailies, both weeklies, turn cap) | 11 | 19 | 26 | 30 | day 27 |
| Casual (2 dailies, 1 weekly, 150 turns a day) | 5 | 10 | 14 | 18 | no |
| Weekends only | 3 | 7 | 11 | 13 | no |
| Active, joins day 15 (+30%) | – | – | 14 | 24 | no |
| Active, joins day 22 (+45%) | – | – | – | 16 | no |

### Late joiners

A player who joins after the round has started earns bonus Cred for the rest of
the round: **+15% for each full week the round had already run when they
joined, up to +45%** (a 28-day round has at most three full weeks behind a
new player). It's a small help, not a full catch-up: an active player who
joins on day 15 earns +30% and reaches about tier 24.

## The track

★ marks milestone tiers. Some pay more than one reward; permanent cosmetics sit
alongside the in-round boosts. Amounts are the starting point for balance
testing, not final.

| Tier | Reward |
| --- | --- |
| 1 | $20,000 |
| 2 | 1,000 condoms |
| 3 | 3 hoes |
| 4 | 25 turns |
| ★ 5 | 25 pistols + 5 thugs |
| 6 | 500 beer |
| 7 | 50 medicine |
| ★ 8 | $50,000 + **Urban Ghost** collection |
| 9 | 250 weed |
| ★ 10 | 3 shotguns + 5 hoes + **Fresh Face** title |
| 11 | 40 turns |
| 12 | Street Frenzy |
| 13 | 10 thugs |
| 14 | 150 ecstasy |
| ★ 15 | $100,000 + Tommy Voucher + **Night Drive · Season 1** theme |
| 16 | 8 hoes |
| 17 | Cookhouse Rush |
| ★ 18 | 200 meth + **Midnight Ops** collection |
| 19 | 60 turns |
| ★ 20 | 2 Tek-9s + 1 Low-Rider + **Made Man** title |
| 21 | $150,000 |
| 22 | 150 cocaine |
| 23 | 2 Burner Phones |
| 24 | 15 thugs |
| ★ 25 | 12 hoes + Doctor Favor + **Chrome Halo · Season 1** frame |
| 26 | 100 turns |
| 27 | 200 heroin |
| ★ 28 | $200,000 + **Cartel Gold** collection |
| 29 | 2 AK-47s + 1 Low-Rider |
| ★ 30 | **Kingpin** title + season badge + season profile frame (all permanent) |

A full pass is worth about **$520,000 cash, 28 hoes, 30 thugs, 225 turns,
2 Low-Riders, 25 pistols, 3 shotguns, 2 Tek-9s, 2 AK-47s**, plus supplies,
product and six favors. Cash was doubled after the balance run (it started at
$260,000).

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
  tier (28, $200,000) is under 2% of an engaged player's end-of-round net
  worth.

## Balance

`npm run qa:street-pass` (also a `qa:release` step) models six kinds of
player day by day from the ruleset's own Cred rates, and values the rewards
with the rankings' net worth formula against the season simulation
(`qa:season`, mixed player, seed 1). It fails if an active player doesn't
finish in the last week, a hardcore one finishes inside two weeks, a casual one
lands outside tiers 15–29, or a day-15 joiner can't get past tier 15.
`--costs 800,1200,1600` tries other tier costs.

What a finished or part-finished pass is worth:

| Day | Active: tier, pass value | Share of engaged net worth | Casual: tier, pass value | Share of casual net worth |
| --- | --- | --- | --- | --- |
| 7 | 11, $75,120 | 3.3% | 5, $25,725 | 2.3% |
| 14 | 19, $175,870 | 3.2% | 10, $75,120 | 2.7% |
| 21 | 26, $330,170 | 3.6% | 14, $83,970 | 1.7% |
| 28 | 30, $488,970 | 3.9% | 18, $175,870 | 2.4% |

The cash is a modest share of a round that ends around $12.5M (engaged) or
$7.3M (casual). The crew is the real boost: 28 hoes are 10–14% of a typical
end-of-round crew (271 engaged, 203 casual) and 30 thugs are 22–28%.

## Shipping

Season 1 ships in `classic-og-street-pass-a` ("Classic OG - Street Pass
(Season 1)"): Trips E plus `streetPass: STREET_PASS_S1` and the ten season
cosmetics. Older rulesets stay without a pass, so rounds already running are
unchanged. Admins pick it when creating a round. The dev seed still creates
its current round on 0.8-H, as it did when Trips E shipped.

## Claiming

- Reaching a tier makes it **claimable**. Nothing is granted automatically, so
  claiming a tier (the tile flips over) is the payoff moment.
- Claims use a one-time claim record, like store and quest receipts, so a
  double tap or retry can never pay twice.
- **When the round ends**, gameplay rewards can no longer be claimed, since
  standings are frozen. Reached-but-unclaimed permanent cosmetic tiers are
  granted automatically, including the theme and frame milestones.

## Season cosmetics

Every season has its own set, so they become collectible. All of them are
permanent on the account, through the existing cosmetics system
(`COSMETIC_UNLOCK`):

| Tier | Cosmetic | Kind | Rarity |
| --- | --- | --- | --- |
| 10 | Fresh Face · Season 1 | title (`TITLE_BADGE`) | rare |
| 20 | Made Man · Season 1 | title (`TITLE_BADGE`) | epic |
| 30 | Kingpin · Season 1 | title (`TITLE_BADGE`) | legendary |
| 15 | Night Drive · Season 1 | site theme (`SITE_THEME`) | epic |
| 25 | Chrome Halo · Season 1 | profile frame (`PROFILE_FRAME`) | epic |
| 30 | Street Pass · Season 1 | badge (`TITLE_BADGE`) | legendary |
| 30 | Season 1 Frame | profile frame (`PROFILE_FRAME`) | legendary |
| 8 | Urban Ghost Collection | item art collection (`ITEM_COLLECTION`) | rare |
| 18 | Midnight Ops Collection | item art collection (`ITEM_COLLECTION`) | epic |
| 28 | Cartel Gold Collection | item art collection (`ITEM_COLLECTION`) | legendary |

Later seasons reuse the title names with their own season number. Because
these tiers carry permanent cosmetics, round close claims them automatically
for a player who reached them but never claimed (cosmetics only). Each
cosmetic needs its own art for the pass tile (step 4).

An item art collection unlocks that collection's authored art for every
weapon, ride, product, supply and crew outfit in the Account Settings locker
(see [COSMETIC-ART-SLICE-D.md](COSMETIC-ART-SLICE-D.md)). The collections were
added to tiers 8, 18 and 28 after Season 1 shipped, so a player who claimed one
of those tiers earlier gets the collection on their next claim, or at round
close at the latest.

## Build outline

### Ruleset

A new optional `streetPass` block, so each round pins its own pass the way it
pins everything else:

```ts
streetPass: {
  credPerTier: [{ fromTier: 1, toTier: 10, cred: 800 }, ...],
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
2. **Done.** `StreetPassProgress` and `StreetPassClaim` tables (migration
   `street_pass`); Cred from turns spent (in the action pipeline, capped per
   daily-contract window) and from job turn-ins
   (`street-pass-cred.service.ts`); `StreetPassService.view` and `.claim`
   (a game action, so it locks, replays a repeated action id and refuses an
   ended round, backed by the claim table's unique key); round close grants
   reached-but-unclaimed cosmetic tiers (`grantUnclaimedCosmetics`). Claims
   log a `STREET_PASS_CLAIMED` activity. Integration tests:
   `STREET_PASS_INTEGRATION=1`.
3. **Done.** `GET /api/game/street-pass` (`{ pass }`, null on rounds without
   one) and `POST /api/game/street-pass/claim` (`{ tier, actionId }`). `/me`
   carries a `streetPass` summary (tier, tier count, claimable) that drives
   the nav entry and its badge; both only show on rounds with a pass. The
   page (`/game/street-pass`) has the Cred bar, a "ready to claim" callout,
   the 30-tier track of item tiles that opens at the player's position, and
   the Cred rates, today's turn Cred and the late-join bonus. Season
   cosmetics show a ★ stand-in tile until step 4.
4. **Done.** Item art for all seven Season 1 cosmetics in
   `apps/web/public/items/street-pass-s1-*.svg`: fresh kicks (Fresh Face),
   a fedora (Made Man), a gold crown (Kingpin), a lanyard pass (badge), a gold
   frame, a neon road card (Night Drive), and a chrome halo frame. The catalog
   uses the `COSMETIC` category so the track and reward chips show them. The Season 1 frame uses
   `.se-profile-frame--street-pass-s1-frame` (gold double border); Chrome Halo
   uses `.se-profile-frame--street-pass-s1-chrome-halo`. Night Drive uses the
   `street-pass-s1-night-drive` player-facing site theme. Titles read as named
   on profiles ("Kingpin · Season 1", not "The …").
   Job finale cosmetics still have no art and stay text chips.
5. **Done.** `npm run qa:street-pass` balance run (six player types, pass
   value against the season simulation), tier costs raised to 800 / 1,200 /
   1,600, cash doubled, and the `classic-og-street-pass-a` ruleset (Trips E +
   Season 1). The Hideout v2 extension is mapped for it too.
