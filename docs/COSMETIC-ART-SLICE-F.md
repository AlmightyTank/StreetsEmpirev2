# Cosmetic Artwork — Slice F: Hover Cards & List Accents

[Slice E](COSMETIC-ART-SLICE-E.md) showed a player's theme and look on their public profile. Slice F carries them to the places you meet other players without opening a profile: the profile hover card, the rankings and the player directory.

## Profile hover card

The hover card already loads the public profile, so it uses Slice E's data with no extra requests:

- **Theme tint.** A card for a player who shows their theme carries that theme's class, which remaps the card's own `--se-hover-*` tokens to the theme's background, panel, line, text and accent colours, and draws the banner from them. An accent the owner picked still beats the theme's accent, and an uploaded banner image still beats the theme banner.
- **Look strip.** Their AK-47 and Low-Rider plus both crew types, in the owner's chosen collections, on one row. Art only, never counts. Shown only when there's something non-classic to show.
- The **Profile effects** list names the theme.

The card is portalled to `document.body`, outside the app root, so the owner's theme never clashes with the viewer's.

## Rankings and the player directory

Each row can carry a small **theme swatch**, a dot in the player's theme accent colours, next to their name, titled with the theme name. Rows themselves are not themed: a list of 50 fully themed rows would be loud and expensive.

The server tags rows with `siteTheme` / `siteThemeLabel` through `profileThemeTags()` (in `profile-showcase.service.ts`): two queries for the whole list, whatever its length. A row gets a tag only when the owner shows their theme on their profile (`showThemeOnProfile`) and has earned it.

Covered lists: national and local rankings (`RankingEntryDto`) and the player directory (`PlayerDirectoryEntryDto`). The turf board is unchanged.

## Code/data map

- `apps/server/src/services/profile-showcase.service.ts`: `profileThemeTags()` and `themeTagFields()`.
- `apps/server/src/services/community.service.ts`: rankings rows get theme tags.
- `apps/server/src/services/player-directory.service.ts`: directory rows get theme tags (`accountId` added to the row select).
- `packages/shared`: optional `siteTheme` / `siteThemeLabel` on `RankingEntryDto` and `PlayerDirectoryEntryDto`.
- `apps/web/src/components/ThemeSwatch.tsx`: the dot; `RankingsPage` and `PlayersPage` render it.
- `apps/web/src/components/PlayerProfileHoverLayer.tsx` and `styles/profile-hover.css`: theme tint, themed banner and look strip.

## Tests

- `profile-showcase.service.test.ts`: theme tags only for owners who show an earned theme, two queries for a whole list, none for an empty list.

## Next

- Combat reports with each side's item and crew art: done in [Slice G](COSMETIC-ART-SLICE-G.md).
