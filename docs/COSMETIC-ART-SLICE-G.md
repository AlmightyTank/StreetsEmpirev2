# Cosmetic Artwork — Slice G: Combat Report Art

Before Slice G, every picture in a battle report used the viewer's own item art: when you hit someone, "Their whores killed" showed *your* hoe outfit. Slice G gives each side of a fight its own art, captured when the fight happens.

## What a report shows

- **Face-off strip.** Under the opponent line: your thug, AK-47 and Low-Rider, then theirs ("vs Vic"), each in that side's collections. Art only, never counts, so it reveals nothing about either side's inventory. Skipped when both sides are all Classic.
- **Rows by side.** Each row's picture uses the art of the side the thing belongs to:
  - the defender's crew, product and rides (whores killed, hoes drugged or lured, thugs lured, product or condoms burned, Low-Riders stolen) use the defender's look;
  - your own spend and stash (Low-Riders sent, product and beer spent, product and crack changes) use yours.
- Cash and turns are not customizable and are unchanged.

## When looks are captured

At battle time. Raid, drive-by and special-raid (drug hoes, steal ride, lure crew) reports each store `looks: { you, opponent }` in the report JSON. A report keeps showing what each side wore then, even after either player changes their loadout, and reading a report costs no extra queries.

- **Your side** is your full look (only collections you've earned).
- **Their side** is their look as they show it: Classic when they've turned off **Show my look on my profile**.

Reports written before Slice G have no `looks` and keep the old behaviour (the viewer's own art throughout).

No migration: reports are already JSON. Each battle adds two small queries (both accounts' profiles and collection unlocks) inside the battle transaction.

## Code/data map

- `apps/server/src/services/profile-showcase.service.ts`: `battleLooks()`.
- `apps/server/src/services/combat.service.ts`: the three report write sites add `looks` to each side's report.
- `packages/shared/src/types/combat.ts`: `BattleLookDto` and `BattleReportDto.looks`.
- `apps/web/src/components/ItemTile.tsx`: `ItemLabel` takes an optional `cosmeticStyle`.
- `apps/web/src/pages/CombatPage.tsx`: `sideStyle()`, `defenderSide()`, the `FaceOff` strip, and per-side row art in the raid, drive-by and special-raid reports.
- `apps/web/src/styles/raids.css`: face-off layout.

## Tests

- `profile-showcase.service.test.ts`: each side gets its own full look and the opponent's shown look; a hidden look is Classic to the opponent but kept in its owner's report; unearned collections read as Classic.
