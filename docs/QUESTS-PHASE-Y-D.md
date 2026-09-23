# Quest Phase Y-D — Global Accents + Profile Frames

Phase Y-D expands permanent quest cosmetics from text prestige into whole-game
appearance.

## Global site accents

The selected account accent now applies at the root player shell instead of
only decorating the public profile header. It drives the main player-facing UI
variables used by:

- primary buttons and hover states;
- active navigation;
- links and focus states;
- meters and highlighted rows;
- player-shell background glow;
- common selection and status treatments.

The original StreetsEmpire, Crimson, Gold, Green, Blue and Purple accents remain
available to every account so existing settings are preserved.

Six Contact-finale accents are additionally unlockable:

| Contact | Accent | Style key |
| --- | --- | --- |
| Mama King | Ghost Violet | `ghost-violet` |
| Pip | Top Shelf Teal | `top-shelf-teal` |
| Tommy | Enforcer Red | `enforcer-red` |
| Wheels | Open Road Blue | `open-road-blue` |
| Vic | Clean Slate Ice | `clean-slate-ice` |
| Blocks | Corner Amber | `corner-amber` |

## Profile frames

Profile frames are permanent account cosmetics with their own selection field.
The public profile header renders the selected frame independently of the site
accent, so players can mix a frame from one Contact with an accent from another.

Initial frames:

- Ghost Wire Frame
- Top Shelf Frame
- Full Rack Frame
- Open Road Frame
- Clean Slate Frame
- Corner Boss Frame

The six frames deliberately use different treatments rather than one border
recolored six times: dashed ghost wiring, double rails, reinforced rack rails,
road markings, an ice-clean minimal glow, and amber corner rails.

## Rewards

Each existing Contact finale now awards:

1. its Y-C permanent title/badge;
2. one matching Y-D site accent;
3. one matching Y-D profile frame.

All source Jobs remain `ONCE`; the existing permanent-cosmetic validator keeps
these rewards out of repeatable contracts.

## Persistence

Y-D reuses `AccountCosmeticUnlock` and adds a snapshotted `styleKey` so the
visual presentation survives later ruleset changes. `AccountProfile` gains
`activeProfileFrameKey`.

A selected quest accent or frame is accepted only when the account owns the
corresponding permanent unlock. Existing base accents are grandfathered as
standard options.

## Compatibility

- New ruleset: `classic-og-v0.7-y` / `0.7.0-Y`
- 0.7-X and older pinned rounds retain their earlier reward catalogs.
- One migration adds the frame selection and cosmetic style-key columns.
- No cosmetic changes gameplay math.
