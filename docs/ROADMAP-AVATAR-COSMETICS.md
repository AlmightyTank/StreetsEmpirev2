# StreetsEmpire — Avatar Cosmetics
## Earned and Drop Wearables for the Built Avatar

**Status:** Plan. Nothing built.  
**Reference branch:** `AlmightyTank/StreetsEmpirev2` → `beta`  
**Prepared:** October 19, 2026  
**Depends on:** the avatar builder (`packages/shared/src/avatar-builder.ts`), `AccountCosmeticUnlock`, The Drop ([THE-DROP.md](THE-DROP.md)), Street Pass ([STREET-PASS.md](STREET-PASS.md)).

---

## 1. Vision

The built avatar is a free chest-up portrait: 16 part slots, every option free.
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

## 2. What exists today

| Piece | Where | Notes |
| --- | --- | --- |
| Part catalog + schema | `packages/shared/src/avatar-builder.ts` | `AVATAR_PART_OPTIONS`, `avatarPartsSchema` (strict), `readAvatarParts()` with per-slot fallback, `DEFAULT_AVATAR_PARTS` per base. |
| Renderer | `apps/web/src/components/BuiltAvatar.tsx` | SVG layers per slot; `AvatarPortrait` wraps it with a frame. |
| Builder UI | `apps/web/src/components/AvatarBuilder.tsx` | Account → Profile. |
| Save path | `apps/server/src/services/account-profile.service.ts` | Stores `profileAvatar` JSON; no ownership check yet. |
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
| `headwear` | over hair | `none` | Snapback, fitted cap, durag, beanie, bucket hat, fedora, crown, Santa hat, halo/horns |
| `grill` | in mouth | `none` | Gold tooth, gold grill, diamond grill |
| `faceMark` | over skin, under facial hair | `none` | Scar, teardrop tattoo, neck tattoo, bandage, black eye |
| `aura` | behind body, over background | `none` | Cigar smoke, falling cash, neon glow, snowfall, sparkle |
| `prop` | in front of shoulder | `none` | Phone, cash stack, dice, briefcase, rose |

`grill` only draws with mouths that show teeth (`grin`, `laugh`, `smile`); with
other mouths it is kept but hidden, and the builder says so.

### 3.2 Locked options in existing slots

| Slot | Locked examples |
| --- | --- |
| `shirt` | Fur coat, track suit, tux, varsity jacket, prison jumpsuit |
| `shirtColor` / `hairColor` | Two-tone and neon gradients, chrome |
| `accessory` | Cuban link, iced chain with pendant (crown, $, faction emblem), watch, monocle |
| `mask` | Faction bandana, Neon visor |
| `background` | Casino floor, penthouse, cell block, vault, one skyline per seeded city |

### 3.3 Sources

| Source | Grant | Examples |
| --- | --- | --- |
| **The Drop** | Bought with Crowns; `sourceQuestKey = 'drop'`, keys `drop-avatar-*` | Kingpin Luxe crown + fur coat; Neon Underworld visor + neon aura; Winter Heist beanie + snowfall aura |
| **Street Pass** | Tier reward | Free track: snapback, durag. Premium track: gold grill, sparkle aura |
| **Gameplay milestones** | Granted in the transaction that earns it | Prison jumpsuit (first arrest), scar (first lost raid as defender), dice prop (casino milestone), city skyline (own turf in that city at round end), briefcase (first loan repaid) |
| **Round placement** | Granted at round rollover | Top 10: round crown or laurel, stamped with the game number in its title |
| **Factions** | Joining/ranking in a faction | Faction-colored bandana, emblem pendant |
| **Holidays / events** | Event contracts | Santa hat (Holiday Road), pumpkin mask |
| **Easter eggs** | Hidden until owned | Halo/horns, golden monocle |
| **Supporter** | Supporter catalogue | Midnight Chrome jacket + chain |

Drop pricing guide (Crowns), in line with frames at 450:

| Kind | Price |
| --- | --- |
| Headwear, grill, prop | 300 |
| Shirt, accessory | 400 |
| Background | 350 |
| Aura (animated) | 500 |

Each Drop collection's bundle adds its avatar pieces; `bundlePriceFor` already
handles partial ownership.

---

## 4. Data and rules

### 4.1 Catalog shape

Part options gain optional fields:

```ts
{ key: 'crown-kingpin', label: 'Kingpin crown', unlock: 'drop-avatar-kingpin-crown', bases?: ['boy'], hidden?: true }
```

- `unlock` — the `AccountCosmeticUnlock.key` that owns it. Absent means free.
- `hidden` — left out of the builder until owned, like hidden item styles.
- `bases` — only if a piece genuinely cannot be drawn for one base. Default is both.

Unlock rows use `kind = 'AVATAR_PART'` and `styleKey = '<slot>:<partKey>'`.

### 4.2 Reading and saving

- `readAvatarParts(value, owned?)` — when `owned` is given, a locked part not in it falls back to the base default for that slot. Public views (profile, rankings, hover card) read with the owner's unlocks so a revoked part disappears everywhere.
- `avatarPartsSchema` adds the new slots with `.default('none')`, the same way `mask` was added.
- `updateProfileSettings` refuses a save with any locked part the account does not own (`profileAvatar: 'One or more avatar parts are not unlocked.'`), matching the existing `featuredBadgeKeys` refusal.

### 4.3 Show my look

Wearables follow the existing **Show my look on my profile** switch: off shows
the avatar with only free parts to other players.

---

## 5. Builder UX

- Each slot lists free options first, then owned locked options, then unowned locked options greyed out with a lock icon and a "How to get" line (Drop price and link, Street Pass tier, or the milestone text). Hidden options are not listed until owned.
- Selecting an unowned option previews it on the portrait but disables Save, with the reason shown.
- Drop item pages and Street Pass tier previews render the player's own avatar wearing the piece (the Street Pass page already does this for frames).
- Unlocking a wearable shows "Wear it now" on the reward toast.

---

## 6. Art rules

- Every piece is drawn for both bases and checked against all 20 hair styles. `headwear` gets a `hairUnderHat` treatment: hair tall enough to clip (afro, high-top, puffs, bun, mohawk) is flattened or hidden under hats that cover it; a durag and halo do not hide hair.
- Masks cover the lower face: `grill` and `faceMark` under a full mask are hidden.
- Auras animate on the same terms as the Drop shells: slow, no flashing, parked under reduced motion.
- Colors come from the part (fixed palette per piece) except where a piece is tinted by an existing color slot (beanie uses `shirtColor`, for example).
- Art is plain SVG in `BuiltAvatar.tsx` layer components; larger pieces may move to `apps/web/src/components/avatar-parts/`.

---

## 7. Slices

### Slice A — Unlock pipeline + first pieces

- `unlock` / `hidden` / `bases` fields, `AVATAR_PART` unlock kind, ownership-aware `readAvatarParts`, server save check.
- New slots `headwear` and `grill`.
- One piece per source to prove each grant path: Drop Kingpin crown, Street Pass snapback, first-arrest prison jumpsuit, Holiday Road Santa hat.
- Builder lock states and "How to get".

**Acceptance:** an unowned part cannot be saved (API test); a revoked part reads as the default everywhere; existing saved avatars render unchanged; Drop no-collision test covers avatar keys.

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

- `avatar-builder.test.ts`: new slots default to `none`; a locked part falls back without ownership and stays with it; every option in every slot is drawable for both bases (or lists `bases`).
- `account-profile.service.test.ts`: save refused for an unowned part; accepted once owned; Show my look hides locked parts from other viewers.
- `collection-coverage.test.ts` / Drop catalog test: avatar unlock keys are unique and never collide with Street Pass, event, supporter or achievement keys.
- Grant tests per source: granting twice is a no-op.

---

## 9. Open questions

1. Should round-placement crowns be per round (collectible, one per game number) or one crown that upgrades?
2. Do earned marks like the scar and black eye stay permanently, or can a player hide them while keeping ownership? (Proposed: owned forever, worn by choice like every part.)
3. Are animated auras allowed in dense lists (rankings, players), or shown static there and animated only on the profile?
4. Do faction pieces stay owned after leaving the faction?
