# UI audit

http://127.0.0.1:5173 · 2026-10-16T04:18:58.114Z · 60 pages × 3 widths

| Check | Result |
| --- | --- |
| Sideways scrolling | 4 page/width(s) |
| Targets under 24 px (touch viewports) | 25 on 13 page/width(s) |
| Targets 24-43 px (touch viewports, noted) | 2075 of 4046 |
| Keyboard focus | 1 page(s) with an unmarked stop or no skip link |
| axe WCAG 2.2 AA | 111 findings in 4 rule(s), 4 serious/critical |
| Script errors | 1 |
| Command Center layout | not specifically audited |

## Sideways scrolling

- /game/products @ phone-390: page 413px on 390px. nav.se-tabbar "Game tabs" (right edge 413px); button.se-tabbar__tab "More" (right edge 409px)
- /game/products @ tablet-768: page 787px on 768px. 
- /game/stores/pip @ phone-390: page 413px on 390px. nav.se-tabbar "Game tabs" (right edge 413px); button.se-tabbar__tab "More" (right edge 409px)
- /game/stores/pip @ tablet-768: page 787px on 768px. 

## Targets under 24 px

- /game/surveys @ phone-390: button.se-tag.se-tag--warn "All" 34x21; button.se-tag "Street stories" 98x21; button.se-tag "Official" 63x21
- /game/surveys @ tablet-768: button.se-tag.se-tag--warn "All" 34x21; button.se-tag "Street stories" 98x21; button.se-tag "Official" 63x21
- /game/rankings @ phone-390: a "Open Game #004 - Strategy Raids records " 265x16; a.se-aftermath-archive-link "Browse, filter, and compare every archiv" 249x16
- /game/rankings @ tablet-768: a "Open Game #004 - Strategy Raids records " 265x16; a.se-aftermath-archive-link "Browse, filter, and compare every archiv" 249x16
- /game/contacts @ tablet-768: a.se-playerlink "Test" 21x44
- /game/news @ phone-390: button.se-tag.se-tag--warn "All" 34x21; button.se-tag "Street stories" 98x21; button.se-tag "Official" 63x21
- /game/news @ tablet-768: button.se-tag.se-tag--warn "All" 34x21; button.se-tag "Street stories" 98x21; button.se-tag "Official" 63x21
- /game/hall-of-fame @ phone-390: a.se-aftermath-archive-link "Browse, filter, and compare every archiv" 249x16
- /game/hall-of-fame @ tablet-768: a.se-aftermath-archive-link "Browse, filter, and compare every archiv" 249x16
- /game/round-archive @ phone-390: a.se-aftermath-archive-link "Open permanent round report →" 161x16; a.se-aftermath-archive-link "Open permanent round report →" 161x16
- /game/round-archive @ tablet-768: a.se-aftermath-archive-link "Open permanent round report →" 161x16; a.se-aftermath-archive-link "Open permanent round report →" 161x16
- /account/forum-link @ phone-390: a "Cancel / account settings" 155x19
- /account/forum-link @ tablet-768: a "Cancel / account settings" 155x19

## Keyboard focus

- /game/console: first Tab is not "Skip to content". 

## axe

- **color-contrast** (serious, 99×) Elements must meet minimum color contrast ratio thresholds. Pages: /game/scout, /game/produce, /game/combat, /game/surveys, /game/hideout, /game/casino/roulette…. e.g. `.se-action-readiness__item:nth-child(1) > span`
- **label** (critical, 6×) Form elements must have labels. Pages: /game/scout, /game/produce. e.g. `#turns-to-spend`
- **scrollable-region-focusable** (serious, 3×) Scrollable region must have keyboard access. Pages: /game/street-pass. e.g. `ol`
- **target-size** (serious, 3×) All touch targets must be 24px large, or leave sufficient space. Pages: /game/casino/roulette. e.g. `.is-red[type="button"]:nth-child(34)`

## Script errors

- /game/console @ desktop-1440-rail: Too many requests. Try again in 1 seconds. | Too many requests. Try again in 1 seconds.
