# Account levels: Crowns and trust gates

Account XP is lifetime and survives every round. It comes from turns spent
(1 XP each) and finished quests (75–300 XP by type). The level curve and the
titles at levels 5, 10, 20, 30 and 50 are unchanged. This slice gives the level
two more jobs.

## Level Crowns

- Every 5 levels pays 20 Crowns and every 25 levels pays 75, with no top level.
  That is 310 Crowns by level 50.
- Each milestone pays once per account (`earn:account-level:<account>:<level>`),
  as an `EARN` with no round, so it sits outside the per-round earn cap.
- It is paid in the XP award transaction when the level goes up. Every milestone
  up to the new level is offered, so accounts that passed milestones before this
  shipped, or while The Drop's earning switch was off, catch up on their next
  level-up.
- The wallet's earn list shows the next level payout. The XP page shows it with
  the lifetime total.

## Trust gates

| Gate | Level | Covers |
| --- | --- | --- |
| `coldMessage` | 4 (450 XP) | A private message to a player who has never written to you this round |
| `foundAlliance` | 6 (1,000 XP) | Founding an alliance and posting its forum recruitment thread |

Below the message gate a player can still reply, message their own alliance,
and message staff. Staff (`isAdmin`) skip both gates. The checks live in
`communication-guard.ts`, beside the 48-hour new-account rules. A refusal is
`403 ACCOUNT_LEVEL_REQUIRED` and names the level needed.

## Pace

`npm run qa:account-xp` (also a `qa:release` step) models four player types over
back-to-back seasons. It fails if starting turns alone clear a gate, if a casual
player cannot message by day 2 or found an alliance by day 4, or if any player
earns more than half the round's play cap in level Crowns in one season. See
[ACCOUNT-XP-PACING.md](ACCOUNT-XP-PACING.md) for the latest run.

Main finding: the curve is fast at the top. A hardcore player reaches level 43
in their first season and 50 about five weeks in. An active player reaches 50
early in season 3. The Crowns schedule is open-ended for this reason. If the
titles should last longer, the curve or the title levels need to change, and
existing levels would move with them.
