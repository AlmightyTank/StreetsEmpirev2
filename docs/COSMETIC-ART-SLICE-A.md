# Cosmetic Artwork — Slice A: Weapons & Rides

Slice A changes item cosmetics from CSS recolors into authored art variants.

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
| Pistol | `weapons/pistol-midnight-ops.svg` | `weapons/pistol-urban-ghost.svg` | `weapons/pistol-cartel-gold.svg` |
| Shotgun | `weapons/shotgun-midnight-ops.svg` | `weapons/shotgun-urban-ghost.svg` | `weapons/shotgun-cartel-gold.svg` |
| Tek-9 | `weapons/tek9-midnight-ops.svg` | `weapons/tek9-urban-ghost.svg` | `weapons/tek9-cartel-gold.svg` |
| AK-47 | `weapons/ak47-midnight-ops.svg` | `weapons/ak47-urban-ghost.svg` | `weapons/ak47-cartel-gold.svg` |
| Low-Rider | `rides/low-rider-midnight-ops.svg` | `rides/low-rider-urban-ghost.svg` | `rides/low-rider-cartel-gold.svg` |

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

Production assets are transparent authored SVG drawings committed directly under `public/items/cosmetics/`.

## Code/data map

### `packages/shared/src/cosmetics.ts`

Owns the shared cosmetic contract:

- `ITEM_COSMETIC_STYLES`
- `ItemCosmeticStyleKey`
- `RELEASED_ITEM_COSMETIC_STYLES`
- `CUSTOMIZABLE_ITEM_KEYS`
- `ItemCosmeticLoadout`
- Classic-only crew contract until Slice C

All three Slice A collections now have all five authored assets committed and are `released: true`.

### `packages/shared/src/schemas/auth.ts`

Validates account settings.

- Only Slice A item keys can receive an item cosmetic.
- Only collections marked `released: true` are accepted.
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

`SLICE_A_ART_FILES` is the active source-of-truth for the 15 committed authored assets.

`ITEM_COSMETIC_ART` activates the committed variants and still falls back to Classic for stale or unknown selections.

All three Slice A collections are registered in `ITEM_COSMETIC_ART`; future collections follow the same pattern.

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
- acceptance of released authored Slice A artwork
- rejection of products/supplies before Slice B

The web resolver test verifies every active Slice A cosmetic maps to an explicit asset while Classic remains the fallback.

## Slice A completion

Midnight Ops, Urban Ghost, and Cartel Gold are active. The five supported item keys each have one separate authored SVG per collection, for 15 new cosmetic assets total.

Before merging, run shared tests, web typecheck/build, server typecheck/build, and the UI audit. Verify all five Account Settings previews and confirm the selection follows the shared `ItemTile` surfaces without changing any gameplay values.

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
