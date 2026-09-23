# Quest Phase Y-E — Player-Facing Site Themes / Decor

Phase Y-E expands permanent account cosmetics into decorative themes that apply
to the entire authenticated player-facing game.

## Scope

Site themes are not Hideout-only skins. The selected theme is applied at the
root `Shell`, so Dashboard, Scout, Produce, Raids, Stores, Travel, City Blocks,
Quests, Rankings, Alliance, Contacts, Hideout and the other player-facing pages
inherit the same decoration.

Themes are independent from:

- site accent;
- profile frame;
- profile title;
- featured badges.

A player can therefore use, for example, Halloween decor with a blue accent and
an Open Road profile frame.

## Winter Lights

Style key: `winter-lights`

The first winter/Christmas pack provides:

- multicolor Christmas lights under the global top bar;
- subtle falling snow over the player shell;
- a cool winter background treatment;
- snow banks and pine silhouettes;
- a snowman silhouette near the lower edge.

## Halloween Moon

Style key: `halloween-moon`

The first Halloween pack provides:

- a full moon in the upper player shell;
- a witch silhouette crossing the moon;
- animated bat silhouettes;
- drifting low fog;
- grave and bare-tree silhouettes;
- a darker purple/orange seasonal background treatment.

## Accessibility

Theme decoration is `aria-hidden`, has `pointer-events: none`, and cannot
block controls. Existing Reduced Motion preference disables snow, bat and fog
animation while retaining the static theme treatment.

## Persistence

`AccountProfile.activeSiteThemeKey` stores the selected presentation style.
Only themes owned through `AccountCosmeticUnlock` are returned as selectable
options, and the server rejects forged/locked selections.

The cosmetic kind is `SITE_THEME`; the original `HIDEOUT_DECOR` kind remains
reserved for a future system if room-specific decorations are ever wanted.

## Acquisition boundary

Y-E deliberately does **not** attach Winter Lights or Halloween Moon to an
existing Contact Job. Their permanent cosmetic definitions are ready for
acquisition, but Phase Y-F holiday/event content should award the keys:

- `winter-christmas-2026`
- `halloween-moon-2026`

This keeps seasonal trophies seasonal instead of permanently attaching them to
unrelated Contact finales.

## Compatibility

- Ruleset: `classic-og-v0.7-z`
- Version: `0.7.0-Z`
- Name: `Classic OG - Site Themes & Decor`
- 0.7-Y and older pinned rounds retain their previous cosmetic catalogs.
- One Prisma migration adds `activeSiteThemeKey`.
- Themes never change gameplay math, resources, ranking, Heat, travel, combat or
  turf.
