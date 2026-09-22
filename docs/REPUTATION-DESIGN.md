> **Legacy design:** This document describes the pre-Jobs trader-favor system retained for pinned historical rounds. Current rounds use the unified Jobs & Contacts system documented in [QUESTS-C-G.md](QUESTS-C-G.md).\n\n# Reputation — design spec

Status: **built.** The spec below is what shipped; where the build diverged
from the plan it is noted inline.

Replaces the weapon unlock ladder with a standing you build across all four
traders, earned by doing them favours and by being a regular.

---

## 1. Why

**The current gate is already broken.** The AK-47 requires 150
`streetWorkTurns` — a counter named after Work the Streets, an action that was
deleted. It only still ticks because Scout was wired to keep feeding it, purely
so the unlock wouldn't become unreachable. The top of the gun ladder is
currently measured in a currency whose action does not exist.

**Three of the four traders are vending machines.** Tommy has favours and a
relationship. The clerk, Charlie and Pip have a price list. Four quests, one
each, is the cheapest way to make the city feel populated, and it gives
Charlie's Low-Riders a purpose before travel ships.

**What it deliberately does not do: sell rep for cash.** See §7.

---

## 2. Data model

A separate table rather than more columns on `RoundPlayer`.

```prisma
model PlayerReputation {
  id            String   @id @default(cuid())
  roundPlayerId String
  /// Ruleset store key: CORNER, TOMMY, CHARLIE, PIP.
  trader        String

  points        Int      @default(0)
  /// Last day this trader credited the regular-trade trickle, so it can be
  /// paid at most once per day without storing a history of trades.
  creditedOn    DateTime?
  questDoneAt   DateTime?

  roundPlayer   RoundPlayer @relation(fields: [roundPlayerId], references: [id], onDelete: Cascade)

  @@unique([roundPlayerId, trader])
  @@index([roundPlayerId])
}
```

Traders are ruleset-defined, so they belong in rows rather than columns. The
existing `*Stock` columns are hardcoded and already can't express a variant
ruleset with a different set of shops — this avoids repeating that mistake for
a second system.

`RoundPlayer` gains one column and loses one:

```prisma
shotgunUnlocked  Boolean @default(false)   // new: shotguns are gated now
streetWorkTurns  Int                        // DELETE
```

The Corner Store quest needs a streak, which is per-player rather than
per-trader:

```prisma
cleanShiftStreak Int @default(0)   // consecutive trips with no condom shortfall
```

---

## 3. Ruleset shape

All numbers live in `packages/rulesets`, as everything else does.

```ts
export const reputation = {
  perTraderMax: 100,

  /** Standing with one trader. Drives the restock perk. */
  tiers: [
    { at: 0,  name: 'Stranger', restockSpeedup: 0 },
    { at: 25, name: 'Known',    restockSpeedup: 0.1 },
    { at: 50, name: 'Regular',  restockSpeedup: 0.2 },
    { at: 75, name: 'Family',   restockSpeedup: 0.3 },
  ],

  /**
   * Being a regular. Credited at most once per trader per day, so it rewards
   * showing up rather than spending - a fortune cannot compress a week of
   * visits into an hour.
   */
  trade: {
    pointsPerDay: 2,
    /** Trading alone can never reach the AK-47. Quests are not optional. */
    maxPoints: 50,
  },

  /** Doing a trader an actual favour. One per trader, one time each. */
  questPoints: 50,
} as const;
```

Unlocks move from work-turns to total rep:

```ts
export const weaponUnlocks = {
  SHOTGUN: { totalRep: 50,  prerequisite: null },
  TEK9:    { totalRep: 150, prerequisite: 'SHOTGUN' },
  AK47:    { totalRep: 248, prerequisite: 'TEK9' },
} as const;
```

Ceiling is **400** (4 traders × 100). Trade-only ceiling is **200**, which is
below the AK-47 gate on purpose — see §4.

---

## 4. Earn curve

Modelled over the 28-day round:

| Player | Shotgun | Tek-9 | AK-47 | Rep at day 28 |
|---|---|---|---|---|
| Daily, quests early | day 2 | day 6 | day 8 | 400 |
| Daily, never quests | day 7 | day 19 | **never** | 200 |
| Every other day | day 4 | day 12 | day 16 | 312 |
| Weekends only | day 7 | day 18 | day 21 | 264 |

Three properties this is tuned for:

1. **The shotgun is reachable on day one or two.** It is the entry rung; it
   should not feel like a wall.
2. **The AK-47 cannot be reached without quests.** Trade-only tops out at 200
   against a 248 gate. The favours are the spine of the system, not a bonus.
3. **Every play pattern that does the quests gets there with time to use it.**
   The weekends-only player unlocks on day 21 with a week of the round left.

### Why the gate is 248 and not 264

264 is exactly what a weekends-only player holds on day 28, so a gate there
would hand them the AK-47 on the last day of the round — inclusion in name
only.

248 is the same number minus one weekend, and it costs nothing to move: because
rep advances in 50-point quest steps, gates anywhere between 232 and 264 unlock
on the *same day* for the daily and every-other-day players. The weekend player
gains a week; nobody else changes.

---

## 5. The four quests

Each costs a **different resource**, so none can be bought through with cash
alone.

| Trader | Quest | Costs | Notes |
|---|---|---|---|
| **Corner Store** | *Keep them covered* — 10 consecutive trips with no condom shortfall | Discipline + upkeep | Streak resets on a short shift. Reinforces the health system. |
| **Tek9 Tommy** | *A favour for Tommy* — deliver 100 crack, 10 thugs minimum | Crack + crew | The existing favour, kept as-is. It already works. |
| **Charlie** | *Back on the lot* — hand him a Low-Rider | A $5,000 car + an 8h wait | Finally gives Low-Riders a use before travel. In drive-by rounds (0.2.0-E) this becomes *Take it for a spin*: buy a Low-Rider, do one drive-by, and keep the car if somebody makes it back. See COMBAT-0.2.0-E.md. |
| **Pip** | *Supply the corners* — sell him 500 rocks | Turns + thugs | No "must be cooked" flag needed: buying at $10 to sell at $3 loses 70%, so the economics already force cooking. |

Pip's is worth a note — it is self-enforcing. Cooking 500 rocks costs $2,500 in
ingredients and returns $1,500, so the real cost is $1,000 plus the turns to
cook it. Buying the rocks instead would cost $5,000 net. The cheap path is the
one that makes you use Produce Crack.

---

## 6. What rep buys

Two things.

**The gun ladder** — shotgun, Tek-9, AK-47, on total rep across all four.

**Faster restocking, per trader** — `intervalMinutes × (1 − restockSpeedup)`:

| | Stranger | Family (−30%) |
|---|---|---|
| Condoms | 60m | 42m |
| Pistols | 2h | 1h 24m |
| Shotguns | 4h | 2h 48m |
| Low-Riders | 8h | 5h 36m |
| Tek-9s | 12h | 8h 24m |
| AK-47s | 24h | 16h 48m |

**Speed, not size — this matters.** The shelf *cap* is the anti-hoarding brake:
it is what stops a player who ignored a shop for a week from clearing a round's
supply in one click. Raising caps for regulars would dissolve exactly the
property the shelves exist to defend. The *interval* is only pacing, so
shortening it for someone the shopkeeper knows is the same fiction with none of
the risk.

This also solves the payoff problem: without it, a whole rep system gates three
guns that currently do nothing, since thug happiness counts any weapon and
pistols are unlimited. Faster restocking is worth something the day you earn it,
with no dependency on 0.2.0 combat.

---

## 7. Why not rep for money spent

Rejected, for two reasons.

**It is cheaply farmable.** Shops buy back at 70%, so churning goods costs the
30% spread, not the price. Against the pistol shelf:

```
600 pistols/day × $50  =  $30,000 of "spend"
600 pistols/day × $15  =   $9,000 actual cost
```

Rep at 30 cents on the dollar, bounded only by the shelves.

**Even without the exploit, it makes rep a cash derivative.** Cash has just been
deliberately pushed out of the driver's seat — weighted to 0.75, capped by
district client capacity, gated by shelves everywhere. A spend-to-rep faucet
reconnects them: the richest player unlocks fastest and the guns become one more
thing money buys. It also creates a chore, where you buy 2,000 condoms you will
never use because the purchase is the point.

The once-per-day trickle is the fix. It rewards the habit a browser game wants,
and money cannot compress it.

---

## 8. Invariants to test

- Trade-only rep can never reach the AK-47 gate.
- The daily trickle credits at most once per trader per calendar day, and a
  second trade the same day adds nothing.
- Rep never exceeds `perTraderMax`, and each quest pays exactly once.
- Every gun gate is reachable inside `round.defaultDurationDays` for a player
  who completes all four quests.
- The restock perk shortens the interval and **never** raises a cap.
- A trader's tier is derived from the ruleset's tier table, not hardcoded.
- Unlocks are one-way: losing rep never revokes a gun already earned (same rule
  as today — earned access stays yours even if cash or crew drops).

---

## 9. Migration

1. Add `PlayerReputation`, `RoundPlayer.shotgunUnlocked`,
   `RoundPlayer.cleanShiftStreak`.
2. Backfill: existing players get a `PlayerReputation` row per trader at 0, and
   `shotgunUnlocked = true` so nobody loses access they already had.
3. Grandfather `tek9Unlocked` / `ak47Unlocked` as they stand.
4. Drop `streetWorkTurns` and the `workTurns` / `thugs` fields on
   `weaponUnlocks`, plus the Scout wiring that feeds the counter.

---

## 10. As built

Two things came out differently from the plan:

- **The favours live in the shops.** A trader asks in their own shop, in the
  same block Tommy's weapon favours always used, rather than on a screen of
  their own. **The Street** is a read-only overview of all four standings, the
  total and the gun ladder, and links through to whichever shop owes you a job.
  A finished favour leaves the counter entirely; the shop keeps one quiet line
  saying where you stand.
- **The clean-shift streak counts cooking too.** Manual 3.2 sends the girls out
  as well, so a cook counts toward the clerk's favour on the same terms as a
  trip - and resets it the same way.

---

## 11. Open decisions

1. **Does rep decay?** Nothing above decays. Decay would punish absence twice
   (you already lose the trickle), so the recommendation is no.
2. **Should the tier be visible?** "Tommy — Regular" is good flavour and, unlike
   district capacity, there is no reason to hide it: it is a fact about you, not
   about the world.
3. **Repeatable quests?** Currently four one-offs. If the trickle proves too
   slow, a repeatable weekly favour per trader is the natural second faucet —
   still effort-priced, not cash-priced.
