# UI consistency 2.0 — Slices B-E completion record

This record maps the implementation to the roadmap and preserves the intentional exceptions identified by the Slice A audit.

## Slice B — foundation

- `theme.css :root` is the single web token authority; the duplicate `polish.css :root` was removed.
- Effective pre-migration colors were retained while adding semantic, spacing, geometry, type, motion, shell, and layer token families.
- CSS imports now express foundation → components → layout → themes → decorative identity → feature art.
- Premium themes own surfaces; the more-specific player accent selector owns standard interaction color.
- Route identity is limited to `--se-page-art-*`; broad route recoloring of panels, tables, and panel headers was removed.
- Compact and comfortable density remain supported.
- `/dev/ui` is a development-only token/component gallery.
- Safe cleanup candidates are documented in `UI-CSS-ARCHITECTURE.md`; none were deleted without an equivalence check.

## Slice C — shared primitives

- `Panel`: React-node title, subtitle, loading state, `aria-labelledby`, and `aria-busy` while retaining existing props.
- `Button`: typed variant/size/block/loading API while preserving caller classes and disabled explanations.
- `Field`: required state and safe class merging with associated hint/error output.
- `Alert`: title and class extension while retaining urgency semantics.
- Added `GamePageHeader`, `SectionHeader`, `GameCard`, `StatCard`, `GameTabs`, `FormControl`, `GameTable`, `EmptyState`, `StatusBadge`, `ProgressBar`, `GameDialog`, and `ActionFooter`.
- SSR contract tests cover labels, statuses, progress, tabs, tables, alerts, and backward-compatible classes.

## Slice D — theme behavior

- `resolveThemePresentation()` defines and tests selected, content-preview, and full-shell takeover modes.
- `routeIdentity()` now classifies every canonical player feature family rather than silently falling back for newer pages.
- Semantic good/warning/bad states remain independent of player accent.
- Events selected tabs, meters, and ordinary chrome now use the selected accent; event result states use semantic tokens.
- Premium decor remains a non-interactive layer and reduced-motion rules remain active.
- The gallery matrix covers `none`, `casino-floor`, `federal-case`, and `midnight-market` with default, gold, green, blue, purple, and high-luminance neon accents.

## Slice E — migration waves

| Wave | Routes/surfaces | Result |
|---|---|---|
| E1 core loop | Dashboard, Scout, Produce, Combat, Events | Existing shared shell retained; Events fixed-color interaction and active-tab contrast migrated |
| E2 progression/economy | Quests, XP, Hideout, Street Pass, Stores, Supply, Holdings, Loans, Dealers, Crew, Travel, Turf, Operations, Black Book | Shared chrome already present on the majority; Holdings, Operations and Black Book now use shared headers/empty/status/loading patterns; Crew private palette moved to theme/state tokens |
| E3 social/identity | Alliance, Players, Console, Rankings, Collection, Supporter, Casino, Profile, Hall of Fame, aftermath | Shared shell and standard controls governed; Casino/Profile/Collection/Turf/aftermath retain documented art/data exceptions |
| E4 admin/auth/edge | Admin workspace, account/auth, gates, errors, loading/empty states | Existing shared workspace/forms remain governed by tokens; common loading, empty, alert, disabled and dialog contracts are now available and demonstrated |

No API calls, endpoint shapes, game calculations, permissions, route guards, or gameplay behavior were changed.

## Approved exceptions

- Casino game canvases: felt, cards, reels, roulette geometry, and game-specific motion.
- Turf/city maps: ownership/category/data colors and map materials.
- Profile and Collection: earned cosmetic previews and explicit full-shell preview takeover.
- Dashboard cinematic and encounter cinema: illustration layers; surrounding actions remain shared.
- Round aftermath: data visualization palette.
- QR codes: white quiet zone.

Exceptions never waive keyboard access, readable status text, overflow behavior, reduced motion, or shared shell/form contrast.

## Validation gates

- TypeScript: `npm run typecheck -w @streets/web` — passed.
- Unit/SSR: shared primitives, theme resolution, and Holdings migration tests — passed. Vitest now includes both `.test.ts` and `.test.tsx` files.
- Production bundle: `npm run build -w @streets/web` — passed; the pre-existing large-chunk advisory remains non-blocking.
- Representative browser matrix: Dashboard, Events, Casino Slots, Login, and `/dev/ui` captured at 390, 768, and 1440. All five samples pass overflow, 24px minimum-target, keyboard-focus, axe WCAG 2.2 AA, and script-error checks. Dashboard also passes its structural checks.
- Exhaustive automated certification: 91 discovered route instances across 273 viewport rows passed strict checks with zero overflow, sub-24px targets, keyboard/skip-link failures, axe WCAG 2.2 AA violations, or script errors.
- Evidence: [`ui-audit-2.0/post-migration/`](./ui-audit-2.0/post-migration/) and the [`certification` manifest](./ui-audit-2.0/post-migration/certification/README.md).

The committed Slice A evidence remains the before-state. Post-migration evidence is recorded separately rather than overwriting that baseline.

The exhaustive run is intentionally split into sequential shards. The local development API applies a server-wide request throttle, so a single monolithic or concurrent run can produce false application errors after sustained traffic. Each strict shard uses a fresh disposable player and the same deterministic route and viewport matrix.

Data-backed dynamic routes were included when valid local fixtures existed: public player profile, round aftermath, admin round/account/player, and player-law details. The local audit database contained no alliance or forum-link record, so `/game/alliances/:tag` and `/game/forum/:forumUserId` remain fixture-dependent exceptions rather than fabricated test data. Their shared shell and component families are covered by the canonical social/profile routes. Automated completion does not replace the separate human screenshot sign-off recorded in the Slice A worksheet.
