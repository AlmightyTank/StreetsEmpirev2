# Cosmetic Artwork — Slice D: Street Pass Unlocks

Slices [A](COSMETIC-ART-SLICE-A.md), [B](COSMETIC-ART-SLICE-B.md) and [C](COSMETIC-ART-SLICE-C.md) shipped three authored art collections for every weapon, ride, product, supply and crew type. Slice D makes those collections **earned**: each one is a permanent Street Pass reward, and the server only lets a player wear collections their account owns.

Classic is always owned. Ownership is per account and permanent, so it survives round resets.

## Where each collection unlocks

| Street Pass · Season 1 tier | Collection | Rarity | Typical player |
| --- | --- | --- | --- |
| 8 | Urban Ghost | rare | active ~day 6, casual ~day 10 |
| 18 | Midnight Ops | epic | active ~day 13, casual by season end |
| 28 | Cartel Gold | legendary | active players finishing the pass |

These tiers had no cosmetic before, and the collections sit next to the existing rewards, so the pass's gameplay value is unchanged (`npm run qa:street-pass` still passes).

One unlock covers the whole collection: all 16 customizable items plus both crew outfits.

## How it works

1. **Ruleset.** `QuestCosmeticKind` gains `ITEM_COLLECTION`. `STREET_PASS_S1_COSMETICS` defines `street-pass-s1-urban-ghost`, `-midnight-ops` and `-cartel-gold`, each with `styleKey` set to the collection key, and tiers 8, 18 and 28 pay them through the usual `COSMETIC_UNLOCK` reward.
2. **Unlock storage.** Claiming the tier writes an `AccountCosmeticUnlock` row, the same table titles, frames and themes use. No migration.
3. **Settings options.** `AccountProfileService.settings` returns every released collection in `itemStyles` and `crewStyles` as a `CollectionOptionDto` with `locked` and `unlockHint`. The hint names the tier on the current round's pass, for example "Street Pass · Season 1, tier 18", and falls back to "Earned on the Street Pass."
4. **Enforcement.** Saving an item or crew collection the account doesn't own fails with `COSMETIC_NOT_EARNED`, like an unearned frame or theme. A saved collection the account no longer owns reads back as Classic.
5. **Locker.** Locked collections appear disabled in each picker, and a list at the top says where to earn them.
6. **Admin QA.** With seasonal admin test mode on, admins can use every collection without unlock rows, as with site themes.

The image files are public, so ownership is never inferred from them. Only the server's unlock rows count.

## Players who claimed a tier before the collections existed

The collections were added to tiers that Season 1 players may already have claimed. `StreetPassService` tops these up: on every tier claim, and again at round close, any cosmetic on a tier the player has already claimed but the account lacks is awarded. Round close still auto-claims reached-but-unclaimed cosmetic tiers, now including 8, 18 and 28.

## Street Pass tiles

Each collection has its own pass-tile art, `apps/web/public/items/street-pass-s1-{urban-ghost,midnight-ops,cartel-gold}.svg`: a collection card showing a pistol in that finish with the collection's emblem.

## Tests

- `account-profile.service.test.ts`: locked options and tier hints, saving owned vs unowned collections for items and crew, stale saved collections reading as Classic, admin QA access.
- `street-pass-cosmetic-topup.test.ts`: the top-up for tiers claimed before the collections existed, without double awards, plus auto-claims at round close.
- `itemCosmeticArt.test.ts`: every non-classic collection is paid by the Season 1 pass.
- `street-pass.test.ts`, `reward-grant.integration.test.ts`, `street-pass.integration.test.ts`: Season 1 now carries ten cosmetics.

## Showing them off

Visitors see an owner's theme and collections on their public profile; see [Slice E](COSMETIC-ART-SLICE-E.md).

## Future seasons

A later pass can re-award a collection (the unlock upsert is a no-op for owners) or introduce a new collection: add its art (Slices A–C pipeline), add it to `ITEM_COSMETIC_STYLES`, and give it an `ITEM_COLLECTION` cosmetic on that season's track.
