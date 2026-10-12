# Easter eggs (spoilers)

Each egg pays a permanent account title the first time it is found, plus a bell
notice (`EASTER_EGG_FOUND`). Unfound eggs are never listed anywhere: the title
only shows among a player's badges once found. The catalog is
`packages/shared/src/easter-eggs.ts`; titles are granted by
`apps/server/src/services/easter-egg.service.ts` as `AccountCosmeticUnlock`
rows with source `easter-eggs` / `EASTER_EGG:<ID>`.

| Egg | Title | How it is found | Where it is checked |
| --- | --- | --- | --- |
| Konami code | Up Up Down Down | ↑ ↑ ↓ ↓ ← → ← → B A anywhere on the site (not in a form field) | Browser, `POST /api/game/easter-eggs/KONAMI` |
| 404 page | Wrong Turn | Visit any address that does not exist while signed in | Browser, `.../WRONG_TURN` |
| The answer | Don’t Panic | Win a casino play staked at exactly $42. Today only Corner Classic can take $42: 3 paylines at $14 a line | `CasinoStatusService.recordResult` |
| 1337 | l33t | Roll 1,337 pips at Street Dice in one round (odds top-ups do not count) | `street-dice.service.ts` |
| Breaking Bad | Heisenberg | A meth cook comes out 99.1% pure (1 in 500 cooks) | `production.service.ts` |
| Scarface | Little Friend | Win a raid sending at most half the defender’s fit thugs | `combat.service.ts` |
| Weeping Angels | Don’t Blink | Statue encounter (Scout): choose “Don’t blink” within 2 minutes of it appearing | `random-encounter-choice.service.ts` |
| Weeping Angels | Displaced | Statue encounter: choose “Run”, or look away from the tab three times and the statue reaches you | as above |
| Pulp Fiction | The Briefcase | Briefcase encounter (Travel): “Open it” | as above |
| The Godfather | The Offer | Corner store encounter (Turf): “Make him an offer” | as above |
| The Wire | Heard the Whistle | Whistling encounter (Produce): “Get off the corner” | as above |
| April Fools | April Fool | 1 April (player’s time zone): press “Wait, what?” on the banner | Browser; the server checks the date |
| Friday the 13th | Camp Counselor | Any Friday the 13th: press “Go out anyway” on the banner | Browser; the server checks the date |

The four encounter eggs are ruleset content, added in `classic-og-v1.8-m`
(1.8.0-M) at weight 1 beside the ordinary entries; a live round finds them once
it is moved to 1.8.0-M. Everything else works in every round.

Date eggs accept the day anywhere from UTC−12 to UTC+14, so a player is never
refused on their own calendar day.
