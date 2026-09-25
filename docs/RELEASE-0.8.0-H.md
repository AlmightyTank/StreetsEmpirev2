# StreetsEmpire 0.8.0-H — Store Economy Release

> **0.8.0 implementation closeout — September 24, 2026**
>
> Feature development for 0.8.0 is closed on `beta` after the H economy hardening
> and the final post-H polish fixes. Those follow-up fixes covered the Tommy shotgun
> voucher, a basket that persists across trader tabs, quest notification deep links,
> the mobile notification inbox, sticky page rails, the completed-quest tab focus
> lock, the Hall of Fame / Status / Rules / News presentation pass, and matching the
> public-site favicon to the game client.
>
> **Promotion is still an operator gate, not a checked box in Git history.** Before
> calling the deployed build released, run the automated QA commands below (including
> the PostgreSQL pass) and complete the phone/desktop browser checklist. Do not infer
> those results from merged PRs.
>
> The rotating Black Market catalog and short-lived reserved-stock system remain
> intentionally deferred follow-up scope. They are not 0.8.0 release blockers.

0.8.0-H closes the Store Improvements & Street Economy milestone. It keeps the
0.8.0-G integration surface and tunes the release ruleset around predictable
scarcity, safe sourcing, and modest cross-system bonuses.

## Release ruleset

- Ruleset: `classic-og-v0.8-h`
- Version: `0.8.0-H`
- Shipment variance: 10% delayed, 12% partial, 6% large
- Special-order base markup: 40%
- Special-order minimum wait: 45 minutes
- Special-order wait multiplier: 0.60 of normal remaining restock time
- Turf special-order discount cap: 8%
- Travel opportunity callout threshold: 12%

The relationship perk and dynamic-pressure systems from C/D remain bounded.
Store calculations still keep buy prices above their matching buyback quote, use
integer cents, and validate whole positive quantities server-side.

## What ships from 0.8.0

- Multi-line, retry-safe Store checkout and faster Store navigation.
- Price/stock context, trend information, and visible trader relationship perks.
- Bounded Pip product pressure tied to the existing local market pressure.
- Deterministic lazy-settled shipments with delayed, partial, and large outcomes.
- Paid special sourcing for eligible sold-out shelf items.
- Hideout, Turf, Travel, and Convoy context on the Store surface.
- H release tuning and a dedicated Store Economy QA gate.

The larger rotating Black Market catalog and short-lived reserved-stock feature
remain follow-up scope rather than blockers for the 0.8.0 release. Special
Orders are the alternate sourcing path shipped in 0.8.0.

## Release QA

Run:

```bash
npm run qa:store-economy
npm run qa:release
npm run qa:release -- --with-db
```

The Store Economy gate checks:

- baseline product money-loop guards;
- maximum relationship perks against direct buy/buyback loops;
- Pip product quotes across the full configured pressure range;
- shipment probability/multiplier bounds;
- thousands of deterministic shipment settlements for negative/over-cap stock;
- special-order best-case fee and wait guardrails;
- Turf and Travel integration caps.

The PostgreSQL Store suite remains the authoritative gate for idempotent retry,
simultaneous purchases/sales, shelf limits, and transactional rollback. 0.8.0-H
extends that suite with multi-line checkout concurrency and H ruleset coverage.

## Manual browser pass

Before promoting beta to release, verify at a phone width and desktop width:

1. Open Stores and move between all four traders.
2. Add several lines to the basket, edit quantities, use Max, and check out.
3. Force one line stale by buying the remaining stock in another tab; the basket
   must fail atomically and explain the line that changed.
4. Confirm price/stock labels, relationship perks, shipment copy, and any special
   order are readable without horizontal scrolling.
5. Keyboard through tabs, item controls, basket controls, and confirmation.
6. Confirm error and success messaging remains visible after checkout.

## Release boundary

0.8.0-H is intentionally a hardening slice, not another economy expansion.
Future economy work should start from this ruleset rather than silently changing
the balance of an already pinned 0.8.0 round.
