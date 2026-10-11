# Supporter cosmetics

Supporter rewards are cosmetic only. They never change stats, prices, cargo,
seats, speed, ranking, visibility or combat (see "Never sell" in
`ROADMAP-FUTURE.md`, section 1.9). Once granted they are permanent: there is
no revoke, and a player keeps them after they stop supporting.

## What a supporter gets

Both come from `SUPPORTER_COSMETICS` in `packages/rulesets/src/supporter.ts`.

| Unlock key | Kind | Style key | What it is |
| --- | --- | --- | --- |
| `supporter-midnight-chrome` | `ITEM_COLLECTION` | `midnight-chrome` | Midnight Chrome looks for the Thug, Hoe, Sedan, Van and Low-Rider |
| `midnight-chrome-frame` | `PROFILE_FRAME` | `midnight-chrome-frame` | The Signature Profile Card |

## Granting

`SupporterService.grant(db, accountId)` writes the missing `AccountCosmeticUnlock`
rows with `sourceQuestKey = 'supporter'` and returns the keys it added. Granting
twice adds nothing. Until checkout exists, an admin grants it from the account
page ("Grant supporter rewards", `POST /admin/accounts/:id/supporter`). The
action is audited as `account.grant-supporter`. A payment hook can later call
the same service.

## Midnight Chrome collection

Midnight Chrome is the first collection that covers only some items.
`COLLECTION_COVERAGE` in `packages/shared/src/cosmetics.ts` names the keys it
has art for. `collectionCovers(style, key)` is checked in four places:

- the locker pickers, which only offer covered collections
- the settings schema, which refuses an uncovered pair
- the public loadouts, which read a stale uncovered value as Classic
- the art tests, which expect a file only where coverage says so

Locked, it shows the hint "Supporter reward." instead of a Street Pass tier.

Art follows the existing cosmetic pipeline: SVG masters in
`apps/web/art/cosmetics/{crew,rides}/*-midnight-chrome.svg`, rendered by
`scripts/art/render-cosmetic-art.mjs` to lossless WebP in
`apps/web/public/items/cosmetics/`. Ride masters draw the Classic geometry inset
to 94% about the canvas centre, which keeps at least 40px of clear space on the
1024×512 render.

## Signature Profile Card

The card turns on while `midnight-chrome-frame` is the popup frame. It restyles
the existing profile header, hover card and settings preview. It is not a
separate component.

- **Plate:** `midnight-chrome-plate.webp`, a 9-slice border image (slice 96,
  drawn at 24px). It is painted on the element's border box, so it fits any
  size and stays put while the hover card scrolls.
- **Surface:** `profileSurface` (Brushed, Carbon or Engine-turned) picks a
  seamless 512px tile. It is public only while the card is equipped.
- **Nameplate:** the honorific in chrome small caps, the supporter mark
  (`midnight-chrome-mark.svg`), and a chrome rule with a crimson tick. The mark
  shows only with the card.
- **Avatar ring:** `midnight-chrome-avatar.webp` when `midnight-chrome-frame` is
  the avatar frame. Its inner edge sits on the avatar at every size (68px hover,
  88px and 64px header, 76px settings preview).
- **Effect:** `midnight-chrome` ("Chrome Glint"), offered once the frame is
  owned. One glint crosses the ring every 9s. It is masked to the ring art and
  off under reduced motion.

Profile-frame masters live in `apps/web/art/profile-frames/` and render to
`apps/web/public/profile-frames/` with the same script
(`node scripts/art/render-cosmetic-art.mjs profile-frames`).
