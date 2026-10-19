# Account levels

Account XP is lifetime and survives every round. Rewards are cosmetic, Crowns,
or access to optional features. A level never adds cash, strength or turns.
Shared rules live in `packages/shared/src/progression.ts`.

## Where XP comes from

| Source | XP | Paid |
| --- | --- | --- |
| Turns spent | 1 per turn for the first 300 turns of each daily window, then half | Per action |
| Quests | Daily 75, weekly 200, season 300, city/event/alliance 150, other Jobs 100 | Per quest |
| Daily check-in | 25 | First check-in of each round day |
| Round Roll Call complete | 300 | Once per round |
| Finishing the intro | 150 | Once per account |
| New easter egg or Hidden Streets secret | 100 | Once per secret |
| Season finish | 500, plus 1,000 for a national top 10, 1,500 more for the podium and 2,500 more for the win | At round close, once per round, only for accounts that earned 1,000 XP during it |
| Mentoring | 250 to the mentor each time a mentee reaches level 5, 10, 15 or 20 | Once per mentee and milestone |

Double XP Weekend doubles all of these while it runs. The turn taper is counted
per account in `Account.turnXpWindowStartsAt` and `turnXpTurnsInWindow`, using the
daily contract window.

## A reward on every level

- **Titles:** the five milestone titles (levels 5, 10, 20, 30 and 50) and 36
  step titles fill every level up to 50 that has no other reward. Every 50
  levels past 50 adds a prestige title ("Twice a Legend", then "Legend ★★★").
  Each level-up grants every title up to the new level, so older accounts catch
  up.
- **Crowns:** 20 every 5 levels and 75 every 25, with no top level. That is 310
  by level 50. Each milestone pays once per account as an `EARN` with no round,
  outside the per-round earn cap, with the same catch-up.
- **Prestige:** a star per 50 levels, shown on the level chip and the XP page.
- `levelRewardsAt(level)` lists what a level gives. The XP page shows the next
  10 levels, and the level-up toast lists everything just earned.

## Unlocks

| Gate | Level | Covers |
| --- | --- | --- |
| `casino` | 3 (250 XP) | Casino plays, chips and sessions. Cashing out, closing a session and leaving a table always stay open |
| `coldMessage` | 4 (450 XP) | A private message to a player who has never written to you this round |
| `sportsbook` | 5 (700 XP) | Sportsbook bets |
| `foundAlliance` | 6 (1,000 XP) | Founding an alliance and posting its forum recruitment thread |

Staff and accounts that have finished a season skip every gate. Below the
message gate a player can still reply, message their own alliance, and message
staff. The checks live in `communication-guard.ts`, and the casino routes apply
them in a `preHandler`. A refusal is `403 ACCOUNT_LEVEL_REQUIRED` and names the
level needed. The experience DTO carries `veteran`, so the client can show
what is open.

## Showing the level

- A level chip appears beside player names on rankings, the Player Directory,
  the alliance wire and roster, and the profile hover card. It is coloured by
  level band, with a star per prestige.
- **Crew rep:** an alliance shows its members' combined and average level. The
  alliance boards add an average level column and tag crews whose average is
  within 5 of your level.

## Endgame

- **Yearly XP leaderboard** (`GET /api/game/xp-leaderboard`, shown on the XP
  page): account XP earned in the UTC calendar year across every round, with
  your own rank. It is backed by an index on `PlayerExperienceEvent.awardedAt`.
- **Level-gated Drop sets:** a collection can set `minAccountLevel`. Crown
  Jewels needs level 25. Below that level, purchase refuses with
  `DROP_LEVEL_REQUIRED` and the shop shows the requirement.

## Mentoring

A player below level 5 who has not finished a season can name one mentor at
level 20 or above, by player number, for good. A mentor takes at most 5
mentees. The mentor earns 250 XP each time a mentee reaches level 5, 10, 15 or
20. Mentees need real play to reach those levels, which keeps alt farming slow.
See `mentoring.service.ts` and the XP page panel.

## Pace

`npm run qa:account-xp` (also a `qa:release` step) models four player types over
back-to-back seasons, each with one Double XP Weekend, every source above and
the turn taper. It fails if:

- starting turns alone clear a gate;
- the intro plus starting turns can clear the reach-out gates;
- a casual player cannot message by day 2 or found an alliance by day 4;
- any player earns more than half the round's play cap in level Crowns in one
  season.

See [ACCOUNT-XP-PACING.md](ACCOUNT-XP-PACING.md) for the latest run.

The curve is still fast at the top. A hardcore player reaches level 44 in
their first season and 50 about five weeks in. An active player reaches 50 at
the end of season 2. Prestige titles, open-ended Crowns and the yearly board
keep the top end moving. Changing the curve itself would move every existing
player's level.
