# Cosmetic Artwork — Slice A: Weapons & Rides

Slice A changes item cosmetics from CSS recolors into authored art variants.

**Status:** shipped. All 15 assets are in `apps/web/public/items/cosmetics/`, every entry is active in `ITEM_COSMETIC_ART`, and Midnight Ops, Urban Ghost and Cartel Gold are `released: true`. No migration was needed.

## Scope

Player-selectable cosmetic targets in this slice:

- Pistol (`PISTOL`)
- Shotgun (`SHOTGUN`)
- Tek-9 (`TEK9`)
- AK-47 (`AK47`)
- Low-Rider (`LOW_RIDER`)

Products and supplies remain Classic until Slice B. Thugs and hoes remain Classic until Slice C adds outfit sets.

Cosmetics are presentation-only. They do not change rarity, prices, inventory, combat, weapon access, vehicle value, Street Cred, XP, quests, or any other gameplay calculation.

## Collections

### Classic

The current production art. Always available and always used as the fallback.

### Midnight Ops

Original premium tactical artwork: matte black and graphite surfaces, low-reflective metal, purposeful attachments/details, subtle wear, no real-world game branding or trademarked blueprint designs.

### Urban Ghost

Original urban blueprint artwork: concrete gray, pale graphite, restrained urban camouflage, clean hardware, colder highlights and worn city textures.

### Cartel Gold

Original high-roller custom artwork: engraved metal, polished/brushed gold accents, dark premium materials, ornamental custom work. Keep silhouettes readable and avoid making the whole object a flat gold recolor.

## Exact asset output paths

All cosmetic artwork lives under `apps/web/public/items/cosmetics/`.

| Item | Midnight Ops | Urban Ghost | Cartel Gold |
| --- | --- | --- | --- |
| Pistol | `weapons/pistol-midnight-ops.webp` | `weapons/pistol-urban-ghost.webp` | `weapons/pistol-cartel-gold.webp` |
| Shotgun | `weapons/shotgun-midnight-ops.webp` | `weapons/shotgun-urban-ghost.webp` | `weapons/shotgun-cartel-gold.webp` |
| Tek-9 | `weapons/tek9-midnight-ops.webp` | `weapons/tek9-urban-ghost.webp` | `weapons/tek9-cartel-gold.webp` |
| AK-47 | `weapons/ak47-midnight-ops.webp` | `weapons/ak47-urban-ghost.webp` | `weapons/ak47-cartel-gold.webp` |
| Low-Rider | `rides/low-rider-midnight-ops.webp` | `rides/low-rider-urban-ghost.webp` | `rides/low-rider-cartel-gold.webp` |

That is 15 new authored images.

## Image requirements

### Pistol

- Source canvas: 512 × 512
- Transparent background
- Side/three-quarter product view
- Entire weapon inside safe margins
- Strong silhouette at a 72 px tile
- Distinct geometry/details between the three cosmetic drawings, not one source with hue shifts

### Shotgun, Tek-9, AK-47

- Source canvas: 1024 × 512
- Transparent background
- Horizontal presentation compatible with the current 2×1 tile
- Consistent left/right orientation across variants
- Preserve enough negative space that labels/counts remain readable

### Low-Rider

- Source canvas: 1024 × 512
- Transparent background
- Three-quarter side view matching the inventory presentation
- Each collection should change paint/material treatment and meaningful exterior customization
- Midnight Ops: blacked-out/night street build
- Urban Ghost: gray/graphite city build
- Cartel Gold: premium custom show-car treatment with polished trim

Export production files as lossless/near-lossless WebP with alpha. Keep source masters outside the runtime tree if desired; only optimized WebP files belong in `public/items/cosmetics/`.

## Source masters and rendering

Each asset has an SVG master in `apps/web/art/cosmetics/{weapons,rides}/`, named like its WebP. Masters use the same 128×128 (pistol) / 256×128 grid, orientation and outline/shadow language as the Classic SVGs, so a cosmetic sits in the tile exactly where Classic does. They are outside `public/`, so they never ship.

Regenerate the runtime files after editing a master:

```sh
node scripts/art/render-cosmetic-art.mjs            # all 15
node scripts/art/render-cosmetic-art.mjs ak47 rides # only matching paths
```

The script rasterises each master at 4× in Chromium (installed Chrome/Edge, or `CHROMIUM_PATH`) and encodes lossless WebP with alpha through Pillow (`python -m pip install pillow`; `PYTHON` overrides the interpreter). Chromium's own canvas encoder only produces lossy WebP, which is why Pillow does the encode step.

What each collection changes per item:

| Item | Midnight Ops | Urban Ghost | Cartel Gold |
| --- | --- | --- | --- |
| Pistol | optic, compensator, weapon light, stippled grip, extended base | lightening cuts, tall sights, flared magwell, camo grip | single-action frame, ring hammer, scroll-engraved slide, pearl grips with medallion |
| Shotgun | collapsible stock, pistol grip, side-saddle shells, vented heat shield, breacher, forend light | camo full stock, top rail, M-LOK forend, extended tube with clamp, ported brake | burl walnut with inlay, engraved receiver, vent rib, gold bands/bead/butt plate |
| Tek-9 | rail with micro optic, slotted handguard, suppressor, extended ribbed mag | camo receiver/grip, triangle-cut shroud, vertical foregrip, birdcage | engraved lacquer receiver, holed gold shroud, ebony grip with diamond inlay |
| AK-47 | skeleton side-folder, optic, quad rail, angled foregrip, slant brake | camo stock with cheek riser, slotted handguard, light, smoke mag, long flash hider | rosewood with inlay, engraved receiver, polished top cover, gold mag, pearl grip |
| Low-Rider | slammed matte black, limo tint, black chrome, deep-dish rims, shark fin, violet underglow | concrete/graphite two-tone, camo rocker wrap, sun visor, pillar spotlight, steelies | candy black-cherry flake, landau top, gold-leaf scrolls, wire wheels with white walls, nose up on hydraulics |

## Code/data map

### `packages/shared/src/cosmetics.ts`

Owns the shared cosmetic contract:

- `ITEM_COSMETIC_STYLES`
- `ItemCosmeticStyleKey`
- `RELEASED_ITEM_COSMETIC_STYLES`
- `CUSTOMIZABLE_ITEM_KEYS`
- `ItemCosmeticLoadout`
- Classic-only crew contract until Slice C

A collection stays `released: false` until all five Slice A assets for that collection exist and have been reviewed. All three Slice A collections are now released.

### `packages/shared/src/schemas/auth.ts`

Validates account settings.

- Only Slice A item keys can receive an item cosmetic.
- A planned collection is rejected while `released: false`.
- This blocks clients from selecting artwork that is not deployed.

### `apps/server/src/services/account-profile.service.ts`

Builds the personalized cosmetic settings payload.

- Only released item styles are returned to the player.
- Crew styles are independent and Classic-only until Slice C.
- Saved JSON remains account-level so the visual loadout survives round resets.

### `prisma/schema.prisma`

`AccountProfile.itemCosmetics` stores the selected item-key → cosmetic-key mapping.

Example after the first real collection releases:

```json
{
  "PISTOL": "midnight-ops",
  "AK47": "cartel-gold",
  "LOW_RIDER": "urban-ghost"
}
```

No new per-weapon inventory rows are needed.

### `prisma/migrations/20261006040000_item_crew_cosmetics/migration.sql`

Adds the JSON cosmetic loadout columns. Slice A does not need another migration.

### `apps/web/src/items/itemCosmeticArt.ts`

Owns the visual asset registry.

`SLICE_A_ART_FILES` (formerly `PLANNED_SLICE_A_ART_FILES`) holds the 15 authored paths.

`ITEM_COSMETIC_ART` contains only files that actually exist: Classic plus the Slice A entries spread in from `SLICE_A_ART_FILES`. If a stale preference references an unknown style, the resolver still falls back to Classic instead of returning a broken image.

### `apps/web/src/components/ItemTile.tsx`

The shared rendering point.

It reads the player's saved cosmetic selection and calls:

```ts
itemCosmeticArtUrl(item, skin)
```

Because stores, inventory, rewards, armory rows and other surfaces already use `ItemTile`, the selected drawing follows the item automatically.

### `apps/web/src/components/ItemCrewCosmeticsEditor.tsx`

Slice A's locker UI.

- Shows only the five weapon/ride targets.
- Uses only released choices returned by the server.
- Previews the actual authored asset through `ItemTile`.
- Products/supplies and crew are explicitly deferred rather than showing fake recolor skins.

### `apps/web/src/pages/AccountSettingsPage.tsx`

Mounts the cosmetic locker and uses released-only fallback choices if the settings request fails.

### `apps/web/src/styles/items.css`

Contains layout for the locker and item tiles.

There are no cosmetic hue/filter classes anymore. Visual variants come from image files.

### Tests

`packages/shared/src/__tests__/profile-settings-site-theme.test.ts` covers:

- Classic defaults for older clients
- valid Slice A item keys
- acceptance of every released Slice A collection
- rejection of unknown artwork keys
- rejection of products/supplies before Slice B

`apps/web/src/items/itemCosmeticArt.test.ts` covers:

- every released style resolving to its own explicit asset
- Classic fallback for unknown styles and items without cosmetic art
- every file being a lossless WebP with alpha at 512×512 (pistol) or 1024×512
- a source master for every runtime file, and no orphan renders

## Activating a completed collection

This is how Slice A was activated, and how a future collection should be. For example, when all Midnight Ops art is committed:

1. Add the 5 WebP files at the paths above.
2. Add the 5 `midnight-ops` entries from `PLANNED_SLICE_A_ART_FILES` to `ITEM_COSMETIC_ART`.
3. Change Midnight Ops to `released: true` in `packages/shared/src/cosmetics.ts`.
4. Run shared tests, web typecheck/build, server typecheck/build, and the UI audit.
5. Verify Account Settings previews all five images.
6. Verify changing a selection updates every `ItemTile` surface after settings refresh.
7. Verify gameplay values are unchanged.

## Future unlocks

Slice A starts with the same storage shape needed for later unlock-gating. When Street Pass, quests, achievements, premium rewards or events award a blueprint, the server can filter the per-account style options without changing `ItemTile` or inventory storage.

Recommended next data addition after the artwork lands:

```ts
{
  key: 'cartel-gold',
  rarity: 'legendary',
  unlock: { kind: 'STREET_PASS', key: '...' }
}
```

Keep unlock ownership server-authoritative; the image file being publicly reachable must never itself count as owning the cosmetic.
