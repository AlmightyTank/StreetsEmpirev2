# Cosmetic Artwork — Slice C: Crew Outfits

Slice C gives thugs and hoes authored outfit sets, finishing the cosmetics pass that [Slice A](COSMETIC-ART-SLICE-A.md) (weapons, rides) and [Slice B](COSMETIC-ART-SLICE-B.md) (products, supplies) started.

**Status:** shipped. Six outfit assets are in `apps/web/public/items/cosmetics/crew/`, active in `ITEM_COSMETIC_ART`, and selectable under **Crew outfits** in the Account Settings locker. No migration was needed: `AccountProfile.crewCosmetics` already stores `{ THUG, HOE }`.

Crew stay aggregate inventory. An outfit is a per-account presentation choice for every thug or hoe that player sees. It does not change crew counts, upkeep, combat, scouting, income or any other gameplay value.

## Collections

Crew reuse the item collection catalog (`ITEM_COSMETIC_STYLES`), so one `released` flag gates items and crew together. They carry their own outfit descriptions (`RELEASED_CREW_COSMETIC_STYLES`) so the picker reads as clothing rather than hardware.

Each outfit keeps the Classic face so the character stays recognisable; headwear, eyewear, hair colour, clothing and jewellery change.

| Crew | Midnight Ops | Urban Ghost | Cartel Gold |
| --- | --- | --- | --- |
| Thug | hood up over a black hoodie, wraparound teal-tint shades, slim plate carrier, dog tags | backwards graphite cap, clear round frames, camo neck gaiter, camo puffer vest over grey hoodie, silver chain | black fedora with gold band, gold aviators, cream suit over black paisley silk, gold grill, Cuban link and medallion |
| Hoe | jet hair with steel sheen, black turtleneck, leather moto jacket, teal studs and pendant, berry lip | platinum hair under a graphite beanie, grey crewneck, camo quilted puffer with pale trim, silver heart chain, mauve lip | brunette with honey highlights, gold crown clip, black velvet gown with gold trim, cream fur stole, layered gold chains and hoops |

## Asset paths

`apps/web/public/items/cosmetics/crew/{thug,hoe}-<collection>.webp`: 512 × 512 lossless WebP with alpha. Masters are in `apps/web/art/cosmetics/crew/` on the 128 × 128 Classic grid:

```sh
node scripts/art/render-cosmetic-art.mjs crew
```

The hoe masters start from the Classic `hoe.svg` portrait and keep its face markup unchanged. When the Classic face is redrawn, carry the change into the three hoe masters so the outfits stay the same character.

## Code/data map

- `packages/shared/src/cosmetics.ts`: `CREW_COSMETIC_STYLE_KEYS` is now the item style catalog; `RELEASED_CREW_COSMETIC_STYLES` supplies the outfit copy.
- `packages/shared/src/schemas/auth.ts`: `crewCosmeticStyleSchema` accepts any released collection (it was `z.literal('classic')`); missing crew keys still default to Classic.
- `apps/server/src/services/account-profile.service.ts`: crew options come from `RELEASED_CREW_COSMETIC_STYLES`; saved loadouts drop unreleased or unknown outfits back to Classic.
- `apps/web/src/items/itemCosmeticArt.ts`: `SLICE_C_ART_FILES` plus `THUG`/`HOE` entries in `ITEM_COSMETIC_ART`.
- `apps/web/src/components/ItemCrewCosmeticsEditor.tsx`: **Crew outfits** section with a picker per crew type.
- `ItemTile` already read `crewCosmetics` for `THUG`/`HOE`, so every crew tile follows the selected outfit with no further change.

## Tests

- `itemCosmeticArt.test.ts` treats crew like items: three authored files per crew type, each a lossless 512 × 512 WebP with a master.
- `profile-settings-site-theme.test.ts` accepts released crew outfits, defaults a missing one to Classic and rejects unknown outfits.
