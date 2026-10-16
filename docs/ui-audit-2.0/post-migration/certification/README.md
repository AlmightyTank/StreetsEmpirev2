# UI Consistency 2.0 exhaustive certification

These reports are the authoritative automated Slices B-E route matrix. They were generated against local nonproduction data with disposable audit accounts and strict mode enabled.

## Result

| Coverage | Reports | Route instances | Viewport rows | Overflow | Targets under 24px | Focus/skip | Axe 2.2 AA | Script errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Public/player canonical routes | 6 | 60 | 180 | 0 | 0 | 0 | 0 | 0 |
| Dynamic and admin routes | 6 | 31 | 93 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **12** | **91** | **273** | **0** | **0** | **0** | **0** | **0** |

The 273 rows use the required presentation matrix:

- 390×844: `federal-case` theme with `crimson` accent;
- 768×1024: `midnight-market` theme with `blue` accent;
- 1440×900: `federal-case` theme with `gold` accent.

Targets measuring 24–43px are retained as advisory data, not failures. The reports recorded 3,886 such targets out of 7,271 measured targets.

## Reports

### Public and player

- [`player-public-1-of-6/report.md`](player-public-1-of-6/report.md)
- [`player-public-2-of-6/report.md`](player-public-2-of-6/report.md)
- [`player-public-3-of-6/report.md`](player-public-3-of-6/report.md)
- [`player-public-4-of-6/report.md`](player-public-4-of-6/report.md)
- [`player-public-5-of-6/report.md`](player-public-5-of-6/report.md)
- [`player-public-6-of-6/report.md`](player-public-6-of-6/report.md)

### Admin and dynamic fixtures

- [`admin-1-of-3/report.md`](admin-1-of-3/report.md)
- [`admin-2-of-3/report.md`](admin-2-of-3/report.md)
- [`admin-3-of-3/report.md`](admin-3-of-3/report.md)
- [`dynamic-player-profile/report.md`](dynamic-player-profile/report.md)
- [`dynamic-aftermath/report.md`](dynamic-aftermath/report.md)
- [`dynamic-admin-player/report.md`](dynamic-admin-player/report.md)

Dynamic discovery covered a public player profile, a READY round aftermath report, and admin round/account/player/player-law detail pages. The local audit database contained no alliance and no forum-link fixture. `/game/alliances/:tag` and `/game/forum/:forumUserId` are therefore documented fixture-dependent exceptions; no fake persistent content was created.

## Execution note

Run shards sequentially. Sustained concurrent or monolithic auditing can trip the development API's server-wide request throttle and create false page/script failures. `scripts/qa/ui-audit.mjs --shard N/T` partitions the filtered route list deterministically and gives each invocation a fresh disposable player.

This evidence certifies automated behavior and accessibility checks. Human screenshot review remains a separate sign-off in [`UI-AUDIT-2.0.md`](../../../UI-AUDIT-2.0.md).
