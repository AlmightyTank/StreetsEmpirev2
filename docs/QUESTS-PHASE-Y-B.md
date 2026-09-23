# Quest Phase Y-B — Legendary Favor Expansion

Phase Y-B makes Legendary favors feel like favors rather than oversized stat
bonuses. Every named Contact now owns a one-per-round Legendary marker.

## New Legendary favors

### Wheels — Open Road

- Activation: armed single-use / UNDERWORLD
- Source: **Home Safe**
- Effect: the next successful intercity run launch skips its outbound police
  road-stop roll.
- The return leg, town bust/arrest checks, convoy PvP and normal turn/cargo
  costs are unchanged.

Implementation deliberately uses the existing `Run.roadChecks` counter. The
successful launch starts with the outbound stop already accounted for, so the
protection remains authoritative even if the player logs out before arrival.

### Vic — Clean Slate

- Activation: armed single-use / STREET
- Source: **Clean Slate**
- Effect: the next successful Heat bribe costs $0.
- The player still chooses a legal number of Heat points to remove; the marker
  cannot remove more Heat than the player currently has.

The favor is checked before the affordability gate and consumed inside the same
successful ActionService transaction as the bribe.

### Blocks — Stand Down

- Activation: armed single-use / MUSCLE
- Source: **Out-of-Town Box**
- Effect: locals stand aside on the next otherwise-valid claim of unheld turf.
- Presence, block/crew caps, minimum posted thugs, fit crew, guns and the normal
  turn cost remain required.
- It does not bypass another player's ownership or a player turf war.

The marker is consumed only after the claim is committed.

## Catalog shape

Phase Y-A already supplied:
- Mama King — Ghost Network
- Pip — Pip's Black Book
- Tommy — Tommy's War Chest

Phase Y-B adds:
- Wheels — Open Road
- Vic — Clean Slate
- Blocks — Stand Down

That leaves all six named Contacts represented in the Legendary catalog.

## Compatibility

- New ruleset: `classic-og-v0.7-w` / `0.7.0-W`
- 0.7-V and older pinned rounds are unchanged.
- No Prisma migration is required.
- All new favors reuse `PlayerArmedFavor` and the Phase X favor content
  switches.
