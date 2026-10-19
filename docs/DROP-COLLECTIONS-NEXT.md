# The Drop: the next nineteen collections

Launch catalogue and rules: [THE-DROP.md](THE-DROP.md).

- **Built (12, evergreen):** in the catalogue since 2026-10-18 and in rotation
  as soon as they deploy. A new Drop item is Live, in the daily pool and in the
  weekly Featured cycle unless an admin changes its catalog entry.
- **Holiday sets (4, built and held):** in the catalogue since 2026-10-19 but
  held as Draft and hidden until an admin releases each in its season.

## Constraints every set follows

- **Only items that have art today** can be dressed: Sedan, Low-Rider, Van,
  Pistol, Shotgun, Tek-9, AK-47, Thug, Hoe. Each look is one partial-coverage
  style key, like the launch sets.
- **No overlap** with looks sold or earned elsewhere: Street Pass S1 (Fire/Ice
  Dragon, Chrome Serpent, Siren Breaker, Phantom Convoy, Lantern District,
  Gilded House, Laurel Ascendant, Dead or Alive, Snowstorm, Inferno, Block
  Sovereign), supporter and earned looks (Cartel Gold, Midnight Ops, Urban
  Ghost, Midnight Chrome, Obsidian Signal, 8-Bit), the hidden easter eggs
  (Holiday Road, Blue Sky, Time Machine) and the launch Drop palettes
  (black/brass, violet/teal neon, frost/snow).
- **Same SKU shape** as launch: vehicle, crew (two outfits or one set),
  optional weapon finish, frame, accent, shell with an illustrated scene,
  title, and one bundle at 54–60% of list. Every animation stops under
  reduced motion.
- **Same price bands**: vehicle 800–850, crew outfit 650–700 (set 900), weapon
  550–600, frame 450, accent 300–350, shell 1,200–1,250, title 200–250. Crown
  Jewels is the flagship and sits a little higher (vehicle and crew set 1,000,
  shell 1,350).

## Built: twelve evergreen collections

| # | Collection | Palette | Vehicle | Crew | Weapon | Title | Bundle (list) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Biscayne Sunset | flamingo pink, sea-glass teal, white linen | Sedan | Thug + Hoe | Pistol | Ocean Drive | 2,750 (4,900) |
| 2 | Velvet Speakeasy | merlot velvet, cream, pewter | Sedan | Thug + Hoe | AK-47 (drum mag) | Bootlegger | 2,800 (5,150) |
| 3 | Platinum Funk | tangerine, chocolate, platinum, fur | Low-Rider | Thug + Hoe | — | Funk Royalty | 2,650 (4,550) |
| 4 | Redline Syndicate | signal red, carbon fibre, race livery | Sedan | Thug + Hoe | AK-47 | Redline | 2,800 (5,150) |
| 5 | Wet Paint | spray mint, chrome, drips | Low-Rider | Thug + Hoe | Pistol | All City | 2,700 (4,800) |
| 6 | Hazard Cook | hazmat yellow, stainless, warning stripes | Van | Crew set | Shotgun | The Chemist | 2,650 (4,450) |
| 7 | Dockside | harbour navy, rust, safety orange | Van | Thug + Hoe | AK-47 | Off the Books | 2,750 (4,950) |
| 8 | Crown Jewels | sapphire, emerald, ruby, platinum | Sedan | Crew set | AK-47 | Crowned | 2,800 (5,100) |
| 9 | Bayou Smoke | moss, cypress, gator hide, fireflies | Van | Thug + Hoe | Shotgun | Swamp King | 2,750 (4,900) |
| 10 | Desert Mirage | bleached sand, rust canyon, turquoise | Low-Rider | Thug + Hoe | Tek-9 | Dust Devil | 2,800 (5,150) |
| 11 | Rewind | VHS magenta and lime on black | Van | Thug + Hoe | Tek-9 | Run It Back | 2,750 (4,900) |
| 12 | Snake Eyes | card felt, ivory dice, red suits | Sedan | Thug + Hoe | Pistol | Loaded Dice | 2,800 (5,100) |

93 SKUs: Sedan 5, Low-Rider 3, Van 4; Pistol 3, Shotgun 2, Tek-9 2, AK-47 4
(the first Drop finishes for the Pistol and AK-47); 12 frames, 12 accents, 12
shells and 12 titles. Bayou Smoke, Desert Mirage, Rewind and Snake Eyes took the
rotation slots first planned for the holiday sets.

Where each piece lives:

- Catalogue: `packages/rulesets/src/drop.ts`.
- Styles, outfit text and coverage: `packages/shared/src/cosmetics.ts`; style
  and accent keys in `packages/shared/src/schemas/auth.ts`,
  `packages/shared/src/types/api.ts` and
  `apps/server/src/services/community.service.ts`.
- Art: recipes in `scripts/art/generate-drop-art.mjs`, output in
  `apps/web/public/items/cosmetics/drop/`, registered in
  `apps/web/src/items/itemCosmeticArt.ts`.
- Accents in `apps/web/src/styles/drop.css`; frames in `drop-art.css`; shells in
  `drop-shells.css` with scenes in `apps/web/src/components/theme-scenes/`.

## Movie homages (3, evergreen)

Added 2026-10-19 and in rotation like the evergreen sets. Each is an original
homage to a film genre's look: **no film names, logos, characters, likenesses,
quotes or music**, so nothing here leans on anyone else's trademark or
copyright. Keep it that way when adding to them.

| Collection | Nod to | Palette | Vehicle | Crew | Weapon | Title | Bundle (list) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quarter Mile | street racing | nitrous blue `#2f9bff`, burnt orange, black | Sedan (tuner) + Low-Rider (muscle car) | Thug + Hoe | Tek-9 | Ride or Die | 2,800 (6,000) |
| 88 Club | time travel | flux blue `#4fd2ff`, brushed steel, fire trails | Van | Thug + Hoe | Pistol | Ahead of Time | 2,750 (4,950) |
| Swamp Kingdom | fairy-tale swamp | moss `#7aa83a`, mud brown, storybook gold | Van | Thug + Hoe | Shotgun | Got Layers | 2,750 (4,900) |

- **Quarter Mile** is the only set with two rides. Frame: a ring of start-tree
  bulbs with a green light. Shell: a drag strip at night, the start tree
  counting down, light trails.
- **88 Club** frame: a clock face stopped at 10:04. Shell: a town-square clock
  tower in a storm, a slow-glowing bolt (never a flash) and twin fire trails.
- **Swamp Kingdom** frame: a vine ring with a gold crown. Shell: a crooked
  outhouse with a KEEP OUT sign, a castle on the hill and a small dragon
  circling it.

## Holiday sets (built, held)

All four are built: art, frames, accents, shells with scenes, titles and
bundles (31 SKUs). Each collection carries a `season`, so its items and bundle
start as **Draft** (`dropDefaultState` in `packages/rulesets/src/drop.ts`):

- Nothing from them is in the shop, the daily picks or the weekly Featured
  cycle, and the storefront doesn't list the collection.
- Their item looks are `hidden` styles, so the locker never shows them, even
  locked, until someone owns one.
- Admins can still preview every piece from the admin Drop page.

**Release windows in code:** a holiday collection can also carry `windows`
(UTC dates) in `drop.ts`; inside one it is Live and featured without any admin
step. Graveyard Shift has one for Halloween 2026: 19 October to 3 November
(00:00 UTC), then it is held again.

**To release one in its month:** in the admin Drop page, set the collection's
entries (its items and its bundle) to Live, or Scheduled with a start time, and
add a Featured offer for the window if you want it on the hero. Set them back
to Vaulted (or Draft) when the season ends; owners keep everything. Return
policy stays `MAY_RETURN` so they can come back next year.

| Collection | Month | Palette | Vehicle | Crew | Weapon | Title |
| --- | --- | --- | --- | --- | --- | --- |
| Graveyard Shift | Oct–Nov | bone white, moss, ghost green `#a8f0c6` | Sedan (hearse) | Thug + Hoe | Pistol | Night Shift |
| Naughty List | Dec | candy red `#e23a3a`, foil green, white | Van | Crew set | Tek-9 | Coal Collector |
| Heartbreaker | Feb | crimson, rose `#ff4d6d`, black satin | Low-Rider | Thug + Hoe | Tek-9 | Cold Hearted |
| Block Party | Jul | mango `#ffb627`, sky blue, hydrant red | Van (ice-cream truck) | Thug + Hoe | Shotgun | Block Captain |

Two existing looks to stay clear of: the `halloween-moon` and `winter-lights`
site themes already cover a Halloween moon and holiday lights, so Graveyard
Shift and Naughty List should lean on their own motifs below.

### Graveyard Shift (Halloween)

Moonlit cemetery work: bone, moss and a cold ghost-green glow.

- **Sedan:** black hearse conversion, wrought-iron roof rail, lace curtains in the rear glass.
- **Thug:** undertaker's frock coat, bowler, bone-handled cane. **Hoe:** black lace mourning dress and veil.
- **Pistol:** bone-inlay grip, etched skull-and-vine slide.
- **Frame:** a wrought-iron gate ring with mist drifting through the bars.
- **Shell:** cemetery gates, crooked trees and low fog rolling across the page.

### Naughty List (December)

The stash house at Christmas: wrapping paper, foil and ribbon. Not snow (Winter Heist owns that).

- **Van:** candy-stripe delivery van with a giant bow on the roof and a "Naughty" plate.
- **Crew set:** ugly-sweater hoodie with a chain (Thug); red velvet coat with white trim (Hoe).
- **Tek-9:** gift-wrap finish with a ribbon-tied grip.
- **Frame:** a ribbon ring tied off with a bow; the bow wobbles once on hover.
- **Shell:** rooftops, wrapped boxes stacked by a back door, a sack of coal.

### Heartbreaker (Valentine's)

Love gone cold: crimson satin, roses and thorns.

- **Low-Rider:** candy-apple red, a chain heart steering wheel, rose-pattern hydraulics.
- **Thug:** rose-embroidered black bomber. **Hoe:** red satin dress and heart-shaped shades.
- **Tek-9:** rose-chrome with an engraved thorn vine.
- **Frame:** a thorned rose ring with a single falling petal.
- **Shell:** a rainy street under a flickering broken-heart sign, petals in the gutter.

### Block Party (summer)

Hot day, open hydrant, music in the street.

- **Van:** an ice-cream truck with a speaker stack on the roof.
- **Thug:** track jacket and bucket hat. **Hoe:** bright two-piece, big hoops.
- **Shotgun:** sticker-bombed finish.
- **Frame:** a speaker-cone ring that thumps gently to a beat.
- **Shell:** brownstones, string flags, an open hydrant spraying, a DJ table on the stoop.
