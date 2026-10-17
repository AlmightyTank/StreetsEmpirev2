# Easter eggs (spoilers)

Each egg pays a permanent account title the first time it is found, plus a bell
notice (`EASTER_EGG_FOUND`). Unfound eggs are never listed anywhere: the title
only shows among a player's badges once found. The catalog is
`packages/shared/src/easter-eggs.ts`; titles are granted by
`apps/server/src/services/easter-egg.service.ts` as `AccountCosmeticUnlock`
rows with source `easter-eggs` / `EASTER_EGG:<ID>`.

| Egg | Title | How it is found | Where it is checked |
| --- | --- | --- | --- |
| Konami code | Up Up Down Down, plus the **8-Bit** look for every item and crew outfit | ↑ ↑ ↓ ↓ ← → ← → B A anywhere on the site (not in a form field) | Browser, `POST /api/game/easter-eggs/KONAMI` |
| 404 page | Wrong Turn | Visit any address that does not exist while signed in | Browser, `.../WRONG_TURN` |
| The answer | Don’t Panic | Win a casino play staked at exactly $42. Today only Corner Classic can take $42: 3 paylines at $14 a line | `CasinoStatusService.recordResult` |
| 1337 | l33t | Roll 1,337 pips at Street Dice in one round (odds top-ups do not count) | `street-dice.service.ts` |
| Breaking Bad | Heisenberg, plus the **Blue Sky** Meth packaging | A meth cook comes out 99.1% pure (1 in 500 cooks) | `production.service.ts` |
| Back to the Future | Great Scott, plus the **Time Machine** Sedan paint job | 21 October (player’s time zone): press “Hit 88 mph” on the banner | Browser; the server checks the date |
| Scarface | Little Friend | Win a raid sending at most half the defender’s fit thugs | `combat.service.ts` |
| Weeping Angels | Don’t Blink | Statue encounter (Scout): choose “Don’t blink” within 2 minutes of it appearing | `random-encounter-choice.service.ts` |
| Weeping Angels | Displaced | Statue encounter: choose “Run”, or look away from the tab three times and the statue reaches you | as above |
| Pulp Fiction | The Briefcase | Briefcase encounter (Travel): “Open it” | as above |
| The Godfather | The Offer | Corner store encounter (Turf): “Make him an offer” | as above |
| The Wire | Heard the Whistle | Whistling encounter (Produce): “Get off the corner” | as above |
| April Fools | April Fool | 1 April (player’s time zone): press “Wait, what?” on the banner | Browser; the server checks the date |
| Friday the 13th | Camp Counselor | Any Friday the 13th: press “Go out anyway” on the banner | Browser; the server checks the date |
| The Ring (destroy it) | Ring-bearer | Carry the Ring to the old foundry in Detroit and throw it in | `ring.service.ts` destroy |
| The Ring (keep it) | My Precious | Still hold the Ring when the round ends | Round close, `grantMyPreciousAtClose` |

The four encounter eggs are ruleset content, added in `classic-og-v1.8-m`
(1.8.0-M) at weight 1 beside the ordinary entries; a live round finds them once
it is moved to 1.8.0-M. Everything else works in every round.

## Easter egg looks

The three looks are hidden item styles (`hidden: true` in
`packages/shared/src/cosmetics.ts`): the locker does not list them, even
locked, until the account owns one. Time Machine fits the Sedan only and Blue
Sky fits Meth only (`items` on the style); 8-Bit is a full collection and also
dresses the crew. Each is granted as its own `ITEM_COLLECTION` unlock beside
the egg's title, so an account that found an egg before its look shipped gets
the look the next time it finds the egg.

The 8-Bit masters are generated from the Classic art:

    node scripts/art/generate-eight-bit-art.mjs
    node scripts/art/render-cosmetic-art.mjs eight-bit

## The Ring

One Ring per round, Lord-of-the-Rings style. The art master is
`apps/web/art/easter-eggs/the-ring.svg`.

- **Surfacing.** Once the round is 48 hours old (`RING_SURFACE_HOURS` in
  `packages/shared/src/ring.ts`), the next combat-page read or Ring-status
  read picks a random active player as bearer and posts round news
  (“A strange Ring has surfaced”), which the Discord bot auto-posts like any
  other news. No cron: `RingService.maybeSurface` is a lazy, idempotent tick.
- **Invisibility.** The bearer gets 24 hours of invisibility
  (`RoundPlayer.invisibleUntil`). Raid, drive-by and special-raid target
  checks (`ringInvisibilityBlock` in `combat.service.ts`) fail with
  “This crew has vanished.” Revenge does not bypass it. Attacking with any of
  the three breaks the spell early (`breakInvisibility`).
- **Revealed.** After the spell lapses the bearer is named on the combat page
  (`hasRing` on the target, `ring` on the page). Scouting never reveals them:
  scouting reads districts, not players.
- **Stealing.** Winning a raid against the revealed bearer takes the Ring
  (`transferOnRaidWin`, no fresh invisibility). Both sides get a `RING_STOLEN`
  bell notice. Drive-bys and special raids never move it.
- **Destroying.** The bearer can throw it into the old foundry in Detroit
  (`POST /api/game/ring/destroy`, `RING_DESTROY_TURN_COST` turns): $100,000
  (`RING_DESTROY_REWARD_CENTS`, ledger source `RING_DESTROY`) plus the
  **Ring-bearer** title, with round news for the act.
- **Round end.** Whoever still holds a live Ring when the round closes gets
  **My Precious** (`grantMyPreciousAtClose` in `closeRoundInTransaction`).

Date eggs accept the day anywhere from UTC−12 to UTC+14, so a player is never
refused on their own calendar day.

## Holiday Road Sedan (Christmas 2026)

- **Where:** a rare TRAVEL random encounter, **The Perfect Christmas Tree**, in new rounds pinned to `classic-og-v2.1-b`.
- **When:** server UTC 2026-12-15 inclusive to 2027-01-06 exclusive (the same window as the existing Christmas event). Outside this window the encounter is not in the draw pool.
- **Choice:** `strap-it-down` helps a stranded family secure the enormous tree. Waving goodbye offers no cosmetic reward. The normal random-encounter popup is reused.
- **Reward:** `holiday-road-sedan` is a legendary, account-permanent `ITEM_COLLECTION` for the hidden `holiday-road` style, usable on `SEDAN` only. The award happens within the idempotent encounter-choice transaction, stored by `AccountCosmeticUnlock(accountId,key)`; the existing cosmetic locker and ItemTile show the style after ownership.
- **Art:** `apps/web/public/items/cosmetics/rides/sedan-holiday-road.svg` is a hand-drawn transparent 256×128 served vector; unlike the authored WebP collections, this Easter egg retains its lossless SVG format.
- **Balance:** appearance only; no changes to vehicle capacity, speed, route risk, price, cash, turns, or other mechanics. Existing pinned rulesets remain unchanged.
- **QA:** test UTC season boundary conditions, first-class encounter choice resolution, repeated claim idempotency, new-version-only content, and the native SVG in the locker. To activate in a currently running beta round, move that round to `classic-og-v2.1-b` through the normal admin ruleset versioning flow.
