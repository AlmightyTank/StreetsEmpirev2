# Cosmetic Artwork — Slice E: Profile Showcase

Slices [A](COSMETIC-ART-SLICE-A.md)–[D](COSMETIC-ART-SLICE-D.md) let a player earn and wear site themes and item/crew art collections, but only the player could see them. Slice E shows them off: a visitor to a public profile sees it in the owner's site theme, plus a **Look** panel of the owner's item and crew art.

## What a visitor sees

- **The owner's theme, on the profile page only.** The profile content renders in the owner's site theme, with its ambient decor. The visitor's own theme is set aside on that page (two themes would fight over the same panels), so their navigation shows the neutral base style. A strip at the top says whose theme it is and offers **Use my theme** / **Show their theme**; the choice resets when they open another profile.
- **The Look.** Every customizable item type (weapons and the Low-Rider, products and supplies) and both crew types, drawn in the owner's chosen collections, plus the collection cards they've earned. It is art only: it never shows counts and it shows every item type whether or not the owner holds any, so it can't leak the inventory that recon protects.
- The visitor's reduced-motion setting still applies to the owner's theme decor.

The Look panel is skipped when there's nothing to show off (all Classic, no collections). A player viewing their own profile sees the panel with a "What visitors see" note, and their own theme as usual.

## Owner controls

Account Settings → interface preferences:

- **Show my theme on my profile** (`showThemeOnProfile`, default on)
- **Show my look on my profile** (`showLookOnProfile`, default on)

Migration `20261006050000_profile_showcase_toggles` adds both columns to `AccountProfile`. Apply it with `prisma migrate deploy` and regenerate the client; the server's `AccountProfile` types need the regenerated client.

## Safety

The public profile only ever shows what the account has earned:

- the theme must be one of the account's `SITE_THEME` unlocks (admin QA themes never appear publicly);
- item and crew picks pass through the same ownership filter as Slice D, so an unowned or stale pick reads as Classic;
- a hidden theme or look is never sent to the visitor at all.

## Code/data map

- `apps/server/src/services/profile-showcase.service.ts`: `profileShowcase()` builds the visitor-facing theme and look; it also owns the Slice D loadout filters (`itemCosmeticLoadout`, `crewCosmeticLoadout`), shared with the settings service.
- `apps/server/src/services/community.service.ts`: the public profile adds `cosmetics.siteTheme`, `cosmetics.siteThemeLabel` and `look`.
- `packages/shared`: `ProfileLookDto`, the two toggles on `AccountProfileSettingsDto` and the settings schema (both default `true`).
- `apps/web/src/stores/pageTheme.ts`: a page-level theme override. Shell drops the viewer's root theme and shows the override's decor while it is set.
- `apps/web/src/pages/ProfilePage.tsx`: themes its content area (`.se-profile--themed` plus the theme class), the theme strip, and the Look section.
- `apps/web/src/components/ProfileLook.tsx`: the Look panel, built from `ItemTile` with the owner's styles.
- `apps/web/src/pages/AccountSettingsPage.tsx`: the two toggles.

## Tests

- `profile-showcase.service.test.ts`: theme and look limited to earned unlocks, both toggles hiding their part, defaults with no profile row.
- `account-profile.service.test.ts`: toggles default on and save off.
- `profile-settings-site-theme.test.ts`: schema defaults and explicit off.

## Later

- Hover cards, rankings and the player directory: done in [Slice F](COSMETIC-ART-SLICE-F.md).
- The owner's item art in combat reports when you fight them.
