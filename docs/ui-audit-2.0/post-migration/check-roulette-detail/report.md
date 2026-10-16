# UI audit

http://127.0.0.1:5173 · 2026-10-16T04:27:32.339Z · 1 pages × 3 widths

| Check | Result |
| --- | --- |
| Sideways scrolling | none |
| Targets under 24 px (touch viewports) | none |
| Targets 24-43 px (touch viewports, noted) | 118 of 189 |
| Keyboard focus | visible on every stop; skip link first |
| axe WCAG 2.2 AA | 3 findings in 1 rule(s), 1 serious/critical |
| Script errors | none |
| Command Center layout | not specifically audited |

## axe

- **target-size** (serious, 3×) All touch targets must be 24px large, or leave sufficient space. Pages: /game/casino/roulette. e.g. `.is-red[type="button"]:nth-child(34)`

