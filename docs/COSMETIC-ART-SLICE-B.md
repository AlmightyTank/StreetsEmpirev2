# Cosmetic Artwork — Slice B: Products & Supplies

Slice B extends the authored-art cosmetics from [Slice A](COSMETIC-ART-SLICE-A.md) to the six products and the three Corner Store supplies. Each collection redraws the packaging, not just the colour, while the product inside stays recognisable.

**Status:** shipped. All 27 assets are in `apps/web/public/items/cosmetics/{products,supplies}/`, active in `ITEM_COSMETIC_ART`, and selectable in the Account Settings locker. No migration was needed: `AccountProfile.itemCosmetics` already stores any item key → style key.

Cosmetics are presentation-only. They do not change product prices, potency, market behaviour, supply effects, rarity or any other gameplay value.

## Scope

| Item key | Classic file | Group |
| --- | --- | --- |
| `CRACK` | `crack.svg` | products |
| `WEED` | `weed.svg` | products |
| `ECSTASY` | `ecstasy.svg` | products |
| `METH` | `meth.svg` | products |
| `COCAINE` | `cocaine.svg` | products |
| `HEROIN` | `heroin.svg` | products |
| `CONDOM` | `condoms.svg` | supplies |
| `MEDICINE` | `medicine.svg` | supplies |
| `BEER` | `beer.svg` | supplies |

Thugs and hoes get outfit sets in [Slice C](COSMETIC-ART-SLICE-C.md).

## Collections

The same three collections as Slice A, so one account loadout and one locker cover every item:

- **Midnight Ops:** matte black tactical packaging, low sheen, teal stencil marks and accents.
- **Urban Ghost:** concrete and graphite materials, restrained urban camouflage, cold highlights, a stencilled ghost mark.
- **Cartel Gold:** black lacquer with polished gold, engraving, crowns and medallions.

| Item | Midnight Ops | Urban Ghost | Cartel Gold |
| --- | --- | --- | --- |
| Crack | mylar stand-up pouch with smoked window, tear notch | brushed tin, camo lid propped open | lacquer jewel case on red velvet, gold clasp |
| Weed | smell-proof pouch with valve and leaf stencil, buds | knurled camo grinder with frosted bud | glass jar of green and purple buds, fluted gold lid, leaf medallion |
| Ecstasy | black-card blister pack, one bubble popped | frosted vial with camo cap, hex pills with ghost stamp | engraved pill compact with crown-stamped gold pills |
| Meth | open hard case with egg-crate foam, teal shards | stoppered lab flask of ice crystal, camo sleeve | sapphire-cut cluster on an engraved gold pedestal |
| Cocaine | vacuum-sealed black brick, teal strapping, code bars | camo brick in duct tape, lines on a concrete slab | beaded gold mirror with lines, gold razor and straw |
| Heroin | fanned black glassine packets, reticle stamp, band | three knotted latex balloons | black envelope with gold wax crest, ornate gold spoon |
| Condoms | three black foils fanned like cards | steel pocket tin with camo lid | draped strip of gold-foil packets with onyx borders |
| Medicine | black trauma pouch, webbing, teal cross patch | concrete hard-shell kit, latches, cross roundel | amber apothecary bottle, gold cap and label, gold capsules |
| Beer | matte black tallboy with condensation | graphite swing-top growler, camo label | black reserve bottle, gold foil neck, crest label |

## Asset paths

`apps/web/public/items/cosmetics/products/<product>-<collection>.webp` and `apps/web/public/items/cosmetics/supplies/<supply>-<collection>.webp`, where the base name matches the Classic SVG (`condoms`, not `condom`). All are 512 × 512 lossless WebP with alpha.

Masters live in `apps/web/art/cosmetics/{products,supplies}/` on the 128 × 128 Classic grid. Render them with the same script as Slice A:

```sh
node scripts/art/render-cosmetic-art.mjs products supplies
```

## Code/data map

- `packages/shared/src/cosmetics.ts`: `WEAPON_RIDE_COSMETIC_KEYS` (Slice A), `PRODUCT_SUPPLY_COSMETIC_KEYS` (Slice B), `CUSTOMIZABLE_ITEM_KEYS` (both), and `ITEM_COSMETIC_GROUPS` (locker sections). The schema and server loadout filter read `CUSTOMIZABLE_ITEM_KEYS`, so they accept the new keys without further changes.
- `apps/web/src/items/itemCosmeticArt.ts`: `SLICE_B_ART_FILES`, `AUTHORED_ITEM_ART_FILES`, and the Classic + Slice B entries in `ITEM_COSMETIC_ART`.
- `apps/web/src/components/ItemCrewCosmeticsEditor.tsx`: renders one locker section per `ITEM_COSMETIC_GROUPS` entry.
- `ItemTile`: unchanged. Every surface that renders a product or supply through `ItemTile`, `ItemLabel` or `ShelfArt` picks up the selected packaging: store shelves, the product counter, Produce, Hideout, Combat, the dashboard, quest and Street Pass rewards.

## Adding a future item

1. Draw three masters on the Classic grid and render them.
2. Add the key to the right group in `cosmetics.ts`.
3. Add its paths to the slice's file map and its entry to `ITEM_COSMETIC_ART`.
4. `itemCosmeticArt.test.ts` fails until every listed file exists as a lossless WebP at 512 px per cell, has a master, and sits in exactly one locker section.
