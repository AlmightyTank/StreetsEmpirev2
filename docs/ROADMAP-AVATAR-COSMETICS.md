# StreetsEmpire — Avatar Cosmetics
## Earned and Drop Wearables for the Built Avatar

**Status:** Slices A, B and C built on `beta` (see §7). Slice D planned.  
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
| `faceMark` | over skin, under facial hair | `none`, freckles, beauty mark, bandage | **Built:** scar. Later: teardrop tattoo, neck tattoo, black eye |
| `aura` | behind body, over background | `none` | **Built:** neon glow, snowfall. Later: cigar smoke, falling cash, sparkle |
| `prop` | in front of shoulder, held in a skin-tone hand | `none`, phone, rose, cash stack | **Built:** gold dice, briefcase |
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
| `shirt` | **Built:** prison jumpsuit, fur coat, heist parka. Later: track suit, tux, varsity jacket |
| `shirtColor` / `hairColor` | Two-tone and neon gradients, chrome |
| `accessory` | Cuban link, iced chain with pendant (crown, $, faction emblem), watch, monocle |
| `mask` | **Built:** neon visor. Later: faction bandana |
| `background` | **Built:** one skyline per seeded city (12). Later: casino floor, penthouse, cell block, vault |

### 3.3 Sources

| Source | Grant | Examples |
| --- | --- | --- |
| **The Drop** | Bought with Crowns; `sourceQuestKey = 'drop'`, keys `drop-<collection>-<slug>` like every Drop item | **Built:** Kingpin Luxe crown, fur coat, crown drops; Neon Underworld visor, glow; Winter Heist parka, snowfall (see Slice B) |
| **Street Pass** | Tier reward (`COSMETIC_UNLOCK`) | **Built:** Snapback at Season 1 tier 4. Later seasons: gold grill, sparkle aura |
| **Gameplay milestones** | Granted in the transaction that earns it | **Built:** prison jumpsuit (first arrest), scar (first raid lost as defender), gold dice (casino jackpot or mega win), briefcase (a loan paid off), city skylines (turf held at round end). Originally planned: scar (first lost raid as defender), dice prop (casino milestone), city skyline (own turf in that city at round end), briefcase (first loan repaid) |
| **Round placement** | Granted at round close | **Built:** top 10 laurel, top 3 diamond studs (one of each, kept for good) |
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

### Slice B — Drop avatar collection (built)

Six more Drop SKUs, all `category: 'PROFILES'`, each in its set's bundle:

| Set | Piece | Unlock key | Slot | Crowns |
| --- | --- | --- | --- | --- |
| Kingpin Luxe | Kingpin Fur Coat (coat in the shirt colour, cream fur collar, brass buttons) | `drop-kingpin-luxe-fur-coat` | shirt | 400 |
| Kingpin Luxe | Crown Drops (brass crown earrings) | `drop-kingpin-luxe-crown-earrings` | earrings | 250 |
| Neon Underworld | Neon Visor (violet-to-teal wraparound) | `drop-neon-underworld-visor` | mask | 300 |
| Neon Underworld | Neon Glow (violet and teal rings that pulse slowly) | `drop-neon-underworld-glow` | aura | 500 |
| Winter Heist | Heist Parka (always frost white, quilted, fur-trimmed collar) | `drop-winter-heist-parka` | shirt | 400 |
| Winter Heist | Snowfall (snow drifting down behind the avatar) | `drop-winter-heist-snowfall` | aura | 500 |

Bundles: Kingpin Luxe 2,800 (ten pieces, list 4,800), Neon Underworld 2,800 (ten, list 5,150), Winter Heist 2,750 (nine, list 4,600). All stay inside the 1,800–2,800 bundle range the Drop tests hold.

- **`aura` slot.** Drawn behind the body, over the background. Motion is CSS in `profile.css` and runs only on a *live* portrait: `BuiltAvatar live` (passed through `AvatarFace` / `AvatarPortrait`). Live portraits: the builder stage, the profile page header, Drop art at medium and large sizes, and the Street Pass preview. Lists, the shell top bar, hover cards and builder thumbnails stay still. This answers open question 3.
- **Reduced motion.** Both the account setting (`.se-reduced-motion` on the shell) and the OS setting stop the pulse and the fall; the snow is parked in view. Checked in Chromium: the live snow layer moves, a non-live one does not, and both settings stop it.
- **Eyewear under the visor.** Shades and glasses are not drawn under the neon visor; the builder notes it under Accessory.
- Drop item pages already preview on the buyer's avatar (Slice A).

### Slice C — Gameplay and placement rewards (built)

- **`faceMark` slot** (free freckles, beauty mark, bandage) and **`prop` slot** (free phone, rose, cash stack), each held in a hand in the skin tone.
- **Laurel** headwear is a wreath, not a hat: hair is never cut under it.
- **Grants**, each through `AvatarWearableService` (idempotent, account-level):

| Piece | Unlock key | When | Where |
| --- | --- | --- | --- |
| Scar | `avatar-scar` | The defender loses a raid (`result.winner === 'ATTACKER'`) | `combat.service.ts`, raid transaction |
| Gold dice | `avatar-dice` | A casino result with a `JACKPOT` or `MEGA_WIN` highlight, any game | `CasinoStatusService.recordResult` |
| Briefcase | `avatar-briefcase` | A loan reaches `PAID_OFF` | `loan-ledger.service.ts`, payment allocation |
| Top 10 laurel | `avatar-top-ten-laurel` | National rank 1–10 when the round closes | `RoundService.closeRoundInTransaction` → `grantAtRoundClose` |
| Diamond studs | `avatar-top-three-diamonds` | National rank 1–3 when the round closes | same |
| City skylines | `avatar-skyline-<city slug>` | Holding at least one block in that city when the round closes | same |

- Round-close grants run after standings freeze and use `sourceQuestKey = 'ROUND_CLOSE:<roundId>'`, so the unlock row says which round first earned it.
- **Open question 1, decided:** one laurel and one pair of diamond studs, kept for good. The first round to earn each is on its unlock row. A per-round collectible would mean a new builder option every round; it can come later as titles or badges instead.
- **Skylines:** twelve backdrops drawn in `BuiltAvatar.tsx` (`SKYLINES` + `Landmark`), each with its own sky, orb, towers and a landmark kept to the side of the head: Empire State, Renaissance Center, Miami palms and deco, Space Needle, Beverly Hills palms, the Strat, the LA crown tower, Atlanta's cylinder, Transamerica and the Golden Gate, Willis Tower, Tulsa deco, Reunion Tower. The city list lives in `@streets/shared` and `@streets/rulesets`; a server test keeps them in step.

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

Slice B:

- `avatar-wearable.service.test.ts`: lists all seven Drop wearables, checks each previews its own piece and sits in its set's bundle.
- `avatar-builder.test.ts`: an avatar saved before auras reads as `aura: 'none'`.
- `drop.test.ts`: the new SKUs pass the existing price, key, style-key and bundle-range checks.

Slice C:

- `avatar-wearable.service.test.ts`: every skyline has a definition; the two city lists match; `grantAtRoundClose` gives the laurel to the top 10, diamonds to the top 3 and a skyline per city held (one per account and city), and never repeats a piece.
- `avatar-wearables.integration.test.ts` (`AVATAR_INTEGRATION=1`): a real round close on Postgres grants the laurel, diamonds and the Detroit skyline.
- `loan-payments.integration.test.ts`: paying off a loan grants the briefcase. `casino-slots.integration.test.ts`: a slots jackpot grants the dice.
- The scar hook is covered by type-checking only: `combat.integration.test.ts` already fails on `beta` before any change (its fixtures predate the birth-date play gate).

---

## 9. Open questions

1. ~~Per-round placement crowns or one?~~ Decided in Slice C: one laurel and one pair of diamond studs, kept for good.
2. Do earned marks like the scar and black eye stay permanently, or can a player hide them while keeping ownership? (Proposed: owned forever, worn by choice like every part.)
3. ~~Are animated auras allowed in dense lists?~~ Decided in Slice B: still in lists, moving only on large single portraits.
4. Do faction pieces stay owned after leaving the faction?
