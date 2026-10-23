# UI CSS architecture

Status: authoritative for UI consistency 2.0 (Slices B-D).

## Cascade contract

`apps/web/src/main.tsx` loads CSS in this order:

1. **Foundation** — Bootstrap, then `theme.css`. The `:root` in `theme.css` is the only browser token owner.
2. **Components** — compatibility/common sheets, `polish.css`, and `shared-components.css` compose tokens into controls and primitives.
3. **Layout** — responsive rules, navigation, UX, dock, app shell, and experience shell.
4. **Theme overrides** — `site-themes.css` may override palette tokens and theme-specific material treatment; `page-identities.css` may style decoration only.
5. **Feature/page art** — route composition and deliberately unique canvases.
6. **Development surfaces** — scoped gallery rules.

Route-local CSS chunks load after the entry bundle. They must therefore use a route-prefixed selector and must not redefine root, theme, shell, or shared-component rules.

## Ownership and precedence

| Concern | Owner | May override | Must not override |
|---|---|---|---|
| Base palette, space, type, geometry, motion, layers | `theme.css :root` | Nothing | — |
| Player accent | `.se-site-accent--*` in `theme.css` | Interaction accent tokens | State colors, page surfaces |
| Premium theme | `site-themes.css` | Surfaces, text palette, theme material/decor | Player-selected interaction accent, semantic state meaning, dimensions |
| Page preview | `resolveThemePresentation()` | Shell only with explicit `takeShell` | Stored player preference |
| Route identity | `page-identities.css` | `--se-page-art-*` and decorative motifs | Buttons, tabs, fields, panels, tables |
| Feature CSS | Route-prefixed file | Feature layout and art | Root tokens or broad `.se-*` primitives |

The effective order is: semantic status invariants → explicit page preview/takeover → premium surface theme → player accent for interaction → decorative route identity. `resolveThemePresentation()` is the executable shell contract. A content-only profile preview intentionally suppresses the viewer shell theme; Collection can explicitly request a full-shell takeover.

## Token names

- Raw theme palette: `--se-bg`, `--se-panel`, `--se-panel-hi`, `--se-line`, `--se-text`, `--se-accent`.
- Semantic aliases: `--se-surface-*`, `--se-border*`, `--se-control-bg`, `--se-on-accent`.
- State: `--se-good`, `--se-warn`, `--se-bad` and matching `-rgb` values. These never derive from accent.
- Spacing: `--se-space-{1,2,3,4,5,6,8,10,12}` on the 4 px rhythm.
- Geometry: `--se-radius-{sm,md,lg,xl}`, `--se-control-h*`, `--se-border-width`.
- Type: `--se-type-{xs,sm,body,lg,title}`.
- Motion: `--se-motion-*`, `--se-ease-standard`.
- Elevation: `--se-layer-{dock,help,sidebar,topbar,dialog,menu,cinema,skip}`.
- Decorative page identity: `--se-page-art-accent`, `--se-page-art-rgb`. The old `--se-page-accent*` names are compatibility aliases for artwork only.

`packages/shared/src/theme.ts` mirrors the cross-platform subset; it is not a second browser source.

## Component rules

Use `Panel`, `Button`, `Field`, and `Alert` for established chrome. New page work may use the primitives in `components/GameUI.tsx`: `GamePageHeader`, `SectionHeader`, `GameCard`, `StatCard`, `GameTabs`, `FormControl`, `GameTable`, `EmptyState`, `StatusBadge`, `ProgressBar`, `GameDialog`, and `ActionFooter`.

```tsx
<GamePageHeader eyebrow="Empire" title="Holdings" description="Your city footprint." />
<Button variant="primary" loading={saving}>Save</Button>
<StatusBadge tone="warning">Pending</StatusBadge>
```

Do not encode state with color alone. Every status needs visible text. Buttons must expose a reason when disabled for a game rule. Forms need a label plus associated hint/error. Tables need a caption, even when visually hidden. Unique canvases (casino games, district maps, profile cosmetics, cinematic scenes) may retain illustration colors, but their surrounding controls use shared primitives.

## Density, motion, and responsive behavior

`se-density--compact` changes shared spacing, not information or order. Both density modes must stay usable at 390, 768, and 1440 px. `se-reduced-motion` is the explicit player setting; feature animation also needs a `prefers-reduced-motion` fallback. Standard touch controls are at least 24 px and frequent mobile actions target 40-44 px.

## Developer gallery

Run the web app in development and open `/dev/ui`. The route is created only when `import.meta.env.DEV` is true. The gallery previews default and premium themes, player accents, both density modes, primitive states, loading/disabled behavior, data tables, empty states, and dialogs. It is the first review surface for token or shared-component changes.

## Safe cleanup list

These removals are safe only after route screenshots are equivalent:

- Old 3 px component radii in early `theme.css` declarations that are superseded by token-composed component rules.
- Compatibility aliases `--se-radius`, `--se-page-accent`, and `--se-page-rgb` after all consumers move to explicit names.
- Repeated premium-theme component selector blocks after every theme is expressible through tokens.
- Page-specific hero/tab/table styles after their routes use shared primitives.
- Numeric z-index declarations after all overlays consume named layer tokens.

Do **not** consolidate casino material colors, turf map/data colors, profile cosmetic palettes, rarity colors, QR quiet zones, or cinematic illustration layers into semantic UI tokens.
