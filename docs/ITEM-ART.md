# Item art

Every item has a picture, so rewards (a battlepass track, job rewards, store
rows, loot) can show the thing itself instead of just its name. The look is a
stash grid: the item sits in the middle of a gridded cell tinted by rarity,
with a short name in the top-right corner and an optional count bottom-right.

- Art: `apps/web/public/items/*.svg`
- Catalog: `apps/web/src/items/itemArt.ts` (`ITEM_ART`, keyed by ruleset key)
- Tile: `apps/web/src/components/ItemTile.tsx` + `apps/web/src/styles/items.css`
- Cosmetic variants: authored WebP art per collection, see [Slice A](COSMETIC-ART-SLICE-A.md) (weapons, rides) and [Slice B](COSMETIC-ART-SLICE-B.md) (products, supplies)

```tsx
<ItemTile item="LOW_RIDER" />
<ItemTile item="CRACK" quantity={12500} size="sm" />
```

## Adding an item

1. Draw the SVG (rules below) and save it in `apps/web/public/items/`.
2. Add an entry to `ITEM_ART` with its name, a short corner label (11
   characters max), category, rarity, file and footprint.
3. `npm test` checks that every store item, weapon, product and favor in every
   ruleset has art, that each file's canvas matches its footprint, and that no
   SVG is left unused. A new ruleset item without art fails that test.

## Drawing rules

- **Canvas**: `viewBox="0 0 128 128"` per cell. A 1x1 item is 128x128, a 2x1
  item (long guns, vehicles) is 256x128. Leave about 8px of air at the edges.
- **Background**: transparent. The tile supplies the grid and rarity colour.
- **Light**: from the top-left. Gradients go light at the top to dark at the
  bottom, with one thin white highlight stroke along the lit edge.
- **Outline**: a near-black stroke (`#0a0b0d`-ish, 1.3–1.6px) around each part.
- **Shadow**: the shared `feDropShadow` filter (`dy=3`, `stdDeviation=2.5`,
  60% black) on the main shapes.
- **Orientation**: guns and vehicles face right. Small things can be tilted
  a few degrees so they don't look pasted in.
- **Text**: avoid it, or keep it to a word or two. The SVG is loaded as an
  image, so it cannot use the site's fonts and falls back to system fonts.
- **Hand-drawn only**: no embedded rasters or external references, so every
  file stays small and crisp at any tile size.

## Rarity

| Rarity | Tint | Used for |
| --- | --- | --- |
| Common | grey | basic supplies, pistols, crack, weed, reputation lost (RP−) |
| Uncommon | green | thugs, hoes, shotguns, mid products, cash, turns |
| Rare | blue | Tek-9s, cocaine, heroin, standard contact favors, reputation gained (RP+) |
| Epic | violet | AK-47s, Low-Riders |
| Legendary | gold | Legendary contact favors |
