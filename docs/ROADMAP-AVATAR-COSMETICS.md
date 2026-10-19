# StreetsEmpire — Avatar Cosmetics
## Earned and Drop Wearables for the Built Avatar

**Status:** Slice A built on `beta` (see §7). Slices B–D planned.  
**Reference branch:** `AlmightyTank/StreetsEmpirev2` → `beta`  
**Prepared:** October 19, 2026  
**Depends on:** the avatar builder (`packages/shared/src/avatar-builder.ts`), `AccountCosmeticUnlock`, The Drop ([THE-DROP.md](THE-DROP.md)), Street Pass ([STREET-PASS.md](STREET-PASS.md)).

---

## 1. Vision

Before Slice A the built avatar was a free chest-up portrait: 16 part slots, every option free.
This plan adds **locked wearables** on top of that set: headwear, grills, face
marks, premium clothes and chains, backdrops and auras. Players earn them
through play or buy them in The Drop. A player's avatar then shows what they
have done and what they own, the way their item collections already do.

### Locked product decisions

1. **The base set stays free.** Every part available today stays unlocked. Locked parts are additions; nobody pays or grinds to look like themselves (skin, base, hair style, eyes, brows, nose, mouth stay free forever).
2. **Two sources, kept apart.** Gameplay and event wearables are never sold. Drop wearables are original to The Drop. The Drop's no-collision test covers avatar keys.
3. **Cosmetic only.** A wearable never changes stats, odds, combat, income or visibility.
4. **No randomness.** Every unlock is either a fixed reward with a stated condition or a fixed Crown price.
5. **Account permanence.** Wearables are `AccountCosmeticUnlock` rows and survive every round.
6. **Server-authoritative.** The server refuses to save an avatar that wears a part the account does not own.
7. **Old avatars keep drawing.** A saved avatar whose part is retired, unknown or no longer owned reads as the base default for that slot, never as an error.

---

## 2. What existed before Slice A

| Piece | Where | Notes |
| --- | --- | --- |
| Part catalog + schema | `packages/shared/src/avatar-builder.ts` | `AVATAR_PART_OPTIONS`, `avatarPartsSchema` (strict), `readAvatarParts()` with per-slot fallback, `DEFAULT_AVATAR_PARTS` per base. |
| Renderer | `apps/web/src/components/BuiltAvatar.tsx` | SVG layers per slot; `AvatarPortrait` wraps it with a frame. |
| Builder UI | `apps/web/src/components/AvatarBuilder.tsx` | Account → Profile. |
| Save path | `apps/server/src/services/account-profile.service.ts` | Stores `profileAvatar` JSON; since Slice A, refuses a locked piece the account does not own. |
| Avatar frames | Street Pass, The Drop | Already locked cosmetics around the avatar; previewed on the Street Pass page. |
| Ownership | `AccountCosmeticUnlock` (`key`, `kind`, `styleKey`, `sourceQuestKey`) | Shared by Drop, Street Pass, supporter, Roll Call, factions, easter eggs. |

Shown on: profile, rankings, players list, profile hover card, shell top bar, Street Pass preview.

---

## 3. Catalog

### 3.1 New slots

Each new slot is a new SVG layer and a new key in `AVATAR_PART_OPTIONS`, with
`none` as its default so existing avatars are unchanged.

| Slot | Layer order | Free options | Locked examples |
| --- | --- | --- | --- |
| `headwear` | over hair | `none`, beanie, durag | **Built:** snapback, Santa hat, Kingpin crown. Later: fitted cap, bucket hat, fedora, halo/horns |
| `grill` | in mouth | `none`, gold tooth, silver grill | Gold grill, diamond grill |
| `faceMark` | over skin, under facial hair | `none` | Scar, teardrop tattoo, neck tattoo, bandage, black eye |
| `aura` | behind body, over background | `none` | Cigar smoke, falling cash, neon glow, snowfall, sparkle |
| `prop` | in front of shoulder | `none` | Phone, cash stack, dice, briefcase, rose |
| `earrings` | on ears, over hair that leaves the ear showing | `none`, studs, hoops (moved from `accessory`) | Diamond studs, gold hoops, big door-knocker hoops, cross dangle, dice dangle, crown drop, faction-emblem stud, single ear cuff |

**Earrings move out of `accessory`.** Today studs and hoops share the
`accessory` slot with the chain, shades and glasses, so a player cannot wear a
chain and earrings together. `earrings` becomes its own slot; the free studs
and hoops move there and `accessory` keeps the chain, shades and glasses.
`readAvatarParts()` migrates a saved `accessory: 'studs' | 'hoops'` to
`earrings` with `accessory: 'none'`, so old avatars look the same. Earrings
were always drawn over every hair style, so hair never hides them; only the ski
mask, which covers the ears, does. The builder notes it under the option.

`grill` only draws with the mouths that show teeth (`grin`, `laugh`); with other
mouths it is kept but hidden. The builder says so and shows each grill
thumbnail on a grin.

### 3.2 Locked options in existing slots

| Slot | Locked examples |
| --- | --- |
| `shirt` | **Built:** prison jumpsuit. Later: fur coat, track suit, tux, varsity jacket |
| `shirtColor` / `hairColor` | Two-tone and neon gradients, chrome |
| `accessory` | Cuban link, iced chain with pendant (crown, $, faction emblem), watch, monocle |
| `mask` | Faction bandana, Neon visor |
| `background` | Casino floor, penthouse, cell block, vault, one skyline per seeded city |

### 3.3 Sources

| Source | Grant | Examples |
| --- | --- | --- |
| **The Drop** | Bought with Crowns; `sourceQuestKey = 'drop'`, keys `drop-<collection>-<slug>` like every Drop item | **Built:** Kingpin Crown (`drop-kingpin-luxe-crown`). Later: Kingpin fur coat + brass crown-drop earrings; Neon Underworld visor + neon aura; Winter Heist snowfall aura |
| **Street Pass** | Tier reward (`COSMETIC_UNLOCK`) | **Built:** Snapback at Season 1 tier 4. Later seasons: gold grill, sparkle aura |
| **Gameplay milestones** | Granted in the transaction that earns it | **Built:** prison jumpsuit (first arrest, at home or on a run). Later: scar (first lost raid as defender), dice prop (casino milestone), city skyline (own turf in that city at round end), briefcase (first loan repaid) |
| **Round placement** | Granted at round rollover | Top 10: round crown or laurel, stamped with the game number in its title. Top 3: diamond studs |
| **Factions** | Joining/ranking in a faction | Faction-colored bandana, emblem pendant, emblem stud earring |
| **Holidays / events** | The event's own reward | **Built:** Santa hat, hidden, with the Holiday Road Sedan. Later: pumpkin mask |
| **Easter eggs** | Hidden until owned | Halo/horns, golden monocle |
| **Supporter** | Supporter catalogue | Midnight Chrome jacket + chain, chrome ear cuff |

Drop pricing guide (Crowns), in line with frames at 450:

| Kind | Price |
| --- | --- |
| Headwear, grill, prop | 300 |
| Earrings | 250 |
| Shirt, accessory | 400 |
| Background | 350 |
| Aura (animated) | 500 |

Each Drop collection's bundle adds its avatar pieces; `bundlePriceFor` already
handles partial ownership.

---

## 4. Data and rules

### 4.1 Catalog shape

Part options gain optional fields (`AvatarPartOption`):

```ts
{ key: 'kingpin-crown', label: 'Kingpin crown', unlock: AVATAR_UNLOCKS.kingpinCrown, unlockHint: 'The Drop: Kingpin Luxe, 300 Crowns.' }
```

- `unlock` — the `AccountCosmeticUnlock.key` that owns it. Absent means free.
- `hidden` — left out of the builder until owned, like hidden item styles.
- `unlockHint` — the "how to get it" line on a locked option.
- A `bases` restriction was not needed: every Slice A piece draws on both bases.

Unlock rows use `kind = 'AVATAR_PART'` and `styleKey = '<slot>:<partKey>'`.

### 4.2 Reading and saving

- `readAvatarParts(value, owned?)` — when `owned` is given, a locked part not in it falls back to the base default for that slot. The owner's settings and the public profile read with the owner's unlocks. Lists (rankings, players, hover card, turf history) read the avatar as saved: the save is checked, and nothing removes an avatar unlock today, so this saves a per-row unlock query. If a revoke path is ever added, it should also reset the stored part.
- `avatarPartsSchema` adds the new slots with `.default('none')`, the same way `mask` was added, and migrates `accessory: 'studs' | 'hoops'` first, so a client still holding an old draft can save.
- `updateProfileSettings` refuses a save with any locked part the account does not own (`COSMETIC_NOT_EARNED`, `profileAvatar: 'One or more avatar pieces are not unlocked.'`), matching the other cosmetic refusals.
- In development, and for admins in seasonal QA mode, every wearable is unlocked, like the catalog frames and themes.

### 4.3 Show my look

Decided in Slice A: the switch does not apply. It hides item and crew
collections; the avatar is the player's own picture and always shows as worn.

---

## 5. Builder UX

- Each slot lists free options first, then owned locked options, then unowned locked options greyed out with a lock icon and a "How to get" line (Drop price and link, Street Pass tier, or the milestone text). Hidden options are not listed until owned.
- Selecting an unowned option previews it on the portrait but disables Save, with the reason shown.
- Drop item pages and Street Pass tier previews render the player's own avatar wearing the piece (the Street Pass page already does this for frames).
- Shuffle only rolls pieces the account owns.
- Not built yet: a "Wear it now" action on reward toasts. The Holiday Road popup names the Santa hat; the arrest and Street Pass grants have no toast of their own.

---

## 6. Art rules

- Every piece is drawn for both bases and checked against all 20 hair styles. Under any hat, hair tall enough to clip (afro, high-top, puffs, bun, mohawk) is drawn as a buzz cut; other styles keep their sides and back. The rim shine on the hair is dropped under a hat. A future halo should opt out of this.
- Masks cover the lower face: `grill` and `faceMark` under a full mask are hidden.
- Auras animate on the same terms as the Drop shells: slow, no flashing, parked under reduced motion.
- Colors come from the part (fixed palette per piece) except where a piece is tinted by an existing color slot (beanie uses `shirtColor`, for example).
- Art is plain SVG in `BuiltAvatar.tsx` layer components; larger pieces may move to `apps/web/src/components/avatar-parts/`.

---

## 7. Slices

### Slice A — Unlock pipeline + first pieces (built)

- `unlock` / `hidden` / `unlockHint` fields, `AVATAR_PART` unlock kind, ownership-aware `readAvatarParts`, server save check.
- New slots `headwear` (free beanie and durag), `grill` (free gold tooth and silver grill) and `earrings` (studs and hoops, moved out of `accessory`).
- One piece per source, each through a real grant path:

| Piece | Unlock key | Slot | How |
| --- | --- | --- | --- |
| Kingpin Crown | `drop-kingpin-luxe-crown` | headwear | The Drop, 300 Crowns; in the Kingpin Luxe bundle (now eight pieces, 2,550) |
| Snapback · Season 1 | `street-pass-s1-snapback` | headwear | Street Pass Season 1 tier 4. Players who claimed tier 4 already get it at round close (the existing cosmetic top-up) |
| Prison Jumpsuit | `avatar-prison-jumpsuit` | shirt | First arrest: `HeatService.afterTrip` (at home) or a run's `ARREST` stop in `TravelService.trade` |
| Santa Hat (hidden) | `holiday-road-santa-hat` | headwear | With the Holiday Road Sedan. An account that already has the Sedan gets the hat the next time it helps with the tree |

- Builder lock states, "How to get", a Hats tab, and Save disabled with a reason while a locked piece is on.
- Previews: the Drop card and detail draw the viewer's avatar wearing the piece (`AVATAR` preview); the Street Pass carousel does the same for the snapback.

**Acceptance (met):** an unowned part cannot be saved (service test); existing saved avatars render unchanged (old saves read with the new slots at `none` and earrings migrated); the Drop no-collision test covers the crown's key and style key.

#### Code map

- `packages/shared/src/avatar-builder.ts`: slots, `AVATAR_UNLOCKS`, `AvatarPartOption`, `lockedAvatarParts`, `AVATAR_LOCKED_OPTIONS`, `avatarUnlockStyleKey`, earrings migration, `readAvatarParts(value, owned?)`.
- `packages/rulesets/src/avatar-wearables.ts`: definitions for wearables earned in play (`AVATAR_WEARABLES`). The Drop crown is in `drop.ts`; the snapback is also listed in `STREET_PASS_S1_COSMETICS` so the pass can grant it.
- `apps/server/src/services/avatar-wearable.service.ts`: `ownedKeys`, idempotent `grant` / `grantToRoundPlayer`. Unlock rows use `sourceRulesetId = 'avatar'`, like the Drop uses `'drop'`.
- `apps/server/src/services/account-profile.service.ts`: `options.avatarUnlocks`, save check, ownership-aware read.
- `apps/web/src/components/BuiltAvatar.tsx`: `Headwear`, `Earrings`, `Grill`, the jumpsuit, and the hair-under-hat rule.
- `apps/web/src/components/AvatarBuilder.tsx`, `apps/web/src/pages/AccountSettingsPage.tsx`, `DropPage.tsx` (`DropArt`), `StreetPassPage.tsx`.
- `apps/web/public/items/street-pass-s1-snapback.svg`: the pass tile.

### Slice B — Drop avatar collection

- Avatar pieces for all three Drop collections (headwear, shirt or accessory, aura) and bundle updates.
- `aura` slot with reduced-motion handling.
- Drop item page preview on the buyer's avatar.

### Slice C — Gameplay and placement rewards

- `faceMark`, `prop` slots.
- Milestone grants (scar, dice, briefcase, city skylines) in their earning transactions, with idempotent keys.
- Round-placement crowns at rollover.

### Slice D — Factions, events, easter eggs, supporter

- Faction pieces, holiday pieces, hidden easter-egg pieces (documented in [EASTER-EGGS.md](EASTER-EGGS.md)), supporter pieces.
- Combat report face-off strip shows each side's portrait as captured at battle time, following the Slice G look-capture rules.

---

## 8. Tests

Slice A:

- `avatar-builder.test.ts`: new slots default to `none`; a saved `accessory: 'studs'` or `'hoops'` reads as that earring with `accessory: 'none'`; starter looks are free; a locked part falls back without ownership and stays with it; unlock keys are unique and every locked piece has a hint; only unlockable pieces are hidden.
- `account-profile.service.test.ts`: save refused for an unowned part and accepted once owned; QA admins get every piece.
- `avatar-wearable.service.test.ts`: every locked builder piece has a definition with kind `AVATAR_PART` and a matching `slot:option` style key; the Drop preview matches; the pass grants the snapback; granting twice is a no-op.
- `drop.test.ts`: the existing no-collision test now covers the crown.
- Integration: `reward-grant.integration.test.ts` claims tier 4 and gets the snapback; `travel-risk.integration.test.ts` checks the jumpsuit after a run arrest and that a second arrest adds nothing.

---

## 9. Open questions

1. Should round-placement crowns be per round (collectible, one per game number) or one crown that upgrades?
2. Do earned marks like the scar and black eye stay permanently, or can a player hide them while keeping ownership? (Proposed: owned forever, worn by choice like every part.)
3. Are animated auras allowed in dense lists (rankings, players), or shown static there and animated only on the profile?
4. Do faction pieces stay owned after leaving the faction?
