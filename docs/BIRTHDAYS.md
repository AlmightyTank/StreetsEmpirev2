# Birthdays

Every account gives a birth date before it can play (the age check), so the game
marks the day. Everything here is Crowns or cosmetic: nothing touches cash,
turns, combat or anything else in the competitive season.

Rules: `packages/rulesets/src/birthday.ts`. Server: `apps/server/src/services/birthday.service.ts`.

## Windows

All times are UTC, worked out from the account's birth date.

| Window | Runs | Gives |
| --- | --- | --- |
| The day | 12:00 UTC the day before the birthday to 12:00 UTC the day after (48 hours, so it covers the birthday in every time zone) | The birthday frame and the Birthday Bash theme; the cake, if opted in |
| The week | From the start of the day for seven days | The gift (claim any time in it) and 15% off in The Drop |

A 29 February birthday falls on 28 February outside leap years. A week that
starts in late December keeps running into January under the year it started.

## What a player gets

- **Gift, once a year:** 300 Crowns and the **Birthday Boss** title, kept for
  good. Claimed from a popup that opens in the game during the week ("Later"
  hides it for that visit). The Crowns are an `EARN` ledger entry outside any
  round, so they never count against the round's earning cap; the ledger key
  `birthday:<account>:<year>` makes a second claim change nothing.
- **15% off in The Drop for the week:** every item, bundle and Street Pass
  skip, after any bundle adjustment, rounded down. Never Crown packs. An active
  supporter gets the larger of this and their 10%; the two never stack. Orders
  record the reason and the price before the discount.
- **A frame and a theme for the day:** the Birthday Frame (confetti) and the
  Birthday Bash shell (bunting, balloons, confetti). They are offered in
  Account → Profile only on the day and are never stored as unlocks, like a
  supporter trial's cosmetics. The hourly "Birthday looks" sweep takes them off
  anyone whose day is over, because directories and leaderboards read the
  saved frame directly.
- **Cake (opt-in, off by default):** Account → Profile → "Show a birthday cake
  on my name". On the day only, other players see 🎂 by the name on the profile
  page and hover card. The API sends only `birthdayToday: true`, never the
  date, age or year.

## API

- `GET /api/birthday`: the signed-in account's own status (`BirthdayStatusDto`).
- `POST /api/birthday/claim`: claims this year's gift; repeats answer `granted: false`.

Neither route can read another account's birthday.

## Privacy

The birth date was collected for the age check. Using it for the gift and
discount stays private to the player; anything other players can see (the
cake) is opt-in. The privacy policy should mention that the birth date is also
used for birthday rewards.
