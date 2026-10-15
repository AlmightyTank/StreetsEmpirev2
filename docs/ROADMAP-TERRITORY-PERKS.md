# StreetsEmpire — Territory Perks Roadmap (Slices A–G)

Status: **Planned** · Target: **beta** · Scope: existing Turf, City Blocks, Alliances, Scout, Produce, Stores, Travel, Combat, Events, Achievements and Profile.

## Vision
Make owning a district, dominating a city, and controlling a multi-city region strategically distinct. Territory should grant visible, server-authoritative *passive perks* and unlock unique activities, without letting a large alliance snowball into an unbeatable monopoly.

This roadmap **extends** the current turf ownership and control mechanics. It does **not** replace or reset current turf claims, city-control rankings, round achievements, or the 1.8.5 consolidated encounter system. Validate actual city/district catalog, round rules, alliance membership and existing buffs before changing schema; example cities and numbers below are balancing proposals, not claims about the live data model.

## Core design

### Territory hierarchy
1. **District** — localized benefit while the alliance controls that district (e.g., scout yields, store proceeds, local defense); derive from existing district-control records.
2. **City** — unique city identity perk while the alliance owns a configurable majority of *eligible* districts in that city (initial proposal: >50%; ties do not grant). Scope can be local or alliance-wide as explicitly declared.
3. **Region** — a curated grouping of eligible cities (e.g., Midwest). Control thresholds: 1 city = foothold, 2 = influence, 3 = power, 4 = domination, 5 = monopoly for a five-city example. Regions with other city counts need data-driven thresholds. Power-tier bonuses replace earlier tier values; never add them.

**Region mapping must be explicit and versioned**; do not infer live regions from city names and do not introduce unimplemented cities as if playable. Seed only city records that actually exist, with fallback for unmapped cities.

### Initial perk catalog (proposals, tune after measuring economy)
| Territory | Example perk | Proposed initial value | Application |
| --- | --- | --- | --- |
| District: industrial | Workshop Advantage | +3% local production output | Produce in district |
| District: market | Street Market | +3% local store proceeds | Store transaction |
| District: transit | Shortcut Routes | -3% local travel expense | Eligible route |
| District: residential | Quiet Streets | +3% local defensive rating | Defending turf |
| Chicago | Iron Grip | +5% owned-turf defense | Eligible local defenses |
| Detroit | Motor City | +5% production efficiency, -5% eligible travel cost | Defined operations |
| Las Vegas | High Roller | +5% casino XP; +3% business income | **No change to game odds or return-to-player** |
| New York City | Empire State | +5% store profit; +3% reputation | Eligible operations |
| Miami | Port Authority | +5% scout supply rewards | Eligible scouting |
| Los Angeles | Street Fame | +5% player XP, +3% contact reputation | Eligible activities |

Only register sample cities that exist in the current playable map; others remain future catalog entries.

### Region prototypes
| Region | Identity | Proposed maximum activated bonus |
| --- | --- | --- |
| Midwest | Industrial Empire | +8% production efficiency |
| Northeast | Financial Powerhouse | +8% eligible business profit |
| Southeast | Southern Connections | +8% contact reputation |
| Southwest | Desert Routes | -10% eligible travel expense |
| West Coast | Pacific Influence | +8% scouting rewards |
| Great Plains | Open Territory | +8% turf reinforcement speed |
| Gulf Coast | Underground Network | +8% eligible trade income |
| Mountain West | Hidden Strongholds | +8% owned-turf defense |

Implement only regions with enough mapped playable cities. Different country/fictional-city layouts can use equivalent fictional regions.

### Rules and guardrails
- Server determines ownership, thresholds, eligibility, and modifiers at the action settlement boundary. UI previews are never authority.
- Each alliance may **activate one regional power perk** at a time, even if it controls multiple regions. Additional control can award non-combat prestige/cosmetic progress; local district/city perks still obey caps.
- Territory modifiers combine through a centralized, deterministic calculation order with existing buffs, membership, quests, item and event modifiers. **Initial proposed combined cap: +12% in a specific production/economy category**; combat and expense-reduction categories get separately tuned ceilings. Avoid double application.
- Participation: configurable, documented contribution threshold for full alliance-wide benefits, with grace for newly joined members. No pay-to-win/Supporter purchase requirement.
- Changing alliance or losing ownership revokes eligibility on the next eligible settlement; optional brief **display/activation grace only** where safe. No perk snapshot may persist across a lost-control settlement to mint rewards.
- Existing round-pinned rulesets continue unchanged. New perks apply only to opted-in, versioned rounds; admin preview in beta must not contaminate live rounds.
- Maintain integer/fixed-point economy math, deterministic rounding, receipts and audit logging. Idempotent reward claims and concurrency protections are mandatory.
- Prevent alliance hopping, duplicate control events, split claims, last-second threshold exploits, buff farming and repeating event rewards.
- Keep player-versus-player fair: no bonuses to casino outcome odds; combat bonuses small, readable and bounded. Permanent awards should be cosmetic/prestige rather than runaway power.

## Implementation slices

### Slice A — Audit, territory schema & rules contract
**Goal:** Establish the existing ownership model and reliable definitions.
- Audit Turf/City Blocks alliance claims, city catalog, region concept (if any), combat/economy modifiers, round rulesets and admin tooling.
- Define versioned district/city/region mappings and perk catalog with typed effect IDs, localization keys, activation requirements, scope and stacking categories.
- Add persistence only where missing: regional activation selection, eligibility/contribution snapshot or durable audit trail. Prefer derived ownership rather than a redundant second source of truth.
- Document tie handling, contested states, newly created cities, disbanded alliances, pause behavior and region size changes.
- Add feature flag disabled by default; fixtures and migration tests against existing populated rounds.

**Acceptance:** Existing ownership is unchanged; migrations are reversible/safe; deterministic catalogs validate all live districts/cities; old pinned rounds have identical behavior.

### Slice B — District passive perk engine
**Goal:** Every owned district can matter.
- Calculate qualifying owner and district effect on the server at Scout, Produce, Store, Turf/Combat and appropriate Travel action settlement.
- Introduce a shared modifier resolver (source IDs, stacking caps, effect totals, explanatory receipts) rather than page-specific multiplier hacks.
- Support control changes and contested/tie states; invalidate caches on authoritative territory events.
- Surface district perk and exact eligible action scope on district details and scout/turf views.
- Add unit/integration cases for rounding, simultaneous control updates, retries, stale clients and limits.

**Acceptance:** Perks activate/deactivate from real control, only apply in qualified locations, and appear once in receipts without regression to resource accounting.

### Slice C — City domination and identity bonuses
**Goal:** Owning a city produces recognizable strategic choices.
- Determine city majority from its existing eligible districts, with correct control rollups and tie/neutral behavior.
- Register distinct city-perk definitions, not hard-coded city-name conditionals.
- Display city progress (controlled/eligible districts), next threshold, active bonus, source and owner.
- Integrate city modifiers into the same server resolver with cap tests and no casino odds modification.
- Award city-control changes through existing notifications/history feed with dedupe.

**Acceptance:** Crossing the city threshold toggles one city perk; city cards match server reality; reconquest and round rollover work.

### Slice D — Regions, tier progress & regional selection
**Goal:** Make the Midwest and other regions long-range alliance objectives.
- Introduce versioned geographical/fictional region memberships and tier thresholds derived from region size.
- Compute region ownership from authoritative cities; display progress and the five-tier concept for five-city regions.
- Require explicit regional power selection; enforce one active regional power per alliance, with safe cooldown to prevent rapid swapping during individual action settlement.
- Region tier upgrades **replace** lower tier values; at monopoly tier unlock prestige/encounter eligibility instead of a second stacking power bonus.
- Provide alliance officers permission-checked selection controls, clear cooldown/region-loss behavior, and logs.

**Acceptance:** No overlapping region grants or tier stacking; UI and server agree; lost cities promptly reduce eligibility; all clients observe changes.

### Slice E — Territory Perks interface
**Goal:** Let players understand why and where they have a bonus.
- Create **Alliance > Empire Perks** panel: districts, cities, regions, active bonuses, inactive/locked perks, activation choice, ownership requirements and participation eligibility.
- Add compact contextual chips on Turf, City Blocks, Scout, Produce, Stores, Travel and relevant action receipts.
- Progress card for each region showing city count/threshold, regional identity and next reward; show *what will change* before an officer switches activated region.
- Responsive desktop/mobile design; keyboard navigation, accessible labels, no layout overflow and color-independent ownership states.
- Admin read-only perk diagnostics: ownership inputs, modifier breakdown, catalog version, selected region and reason a perk is inactive.

**Acceptance:** Players can trace an applied modifier to its source; no extra primary navigation tab required; previews never misstate server-applied perks.

### Slice F — Encounters, milestones and cosmetics
**Goal:** Unlock content beyond incremental percentages.
- Hook territory-exclusive encounters, Regional Boss/Kingpin Contracts, black-market stock, safehouse intelligence and supply-line opportunities into **the consolidated 1.8.5 event system** (no competing encounter engine).
- Gate activities by region/city eligibility and contribution with clear expiration, once-only claims and per-round budgets.
- Award region-hold milestones, animated cosmetic badges/profile frames, Hall of Fame recognition and a **National Kingpin** round achievement for controlling every eligible region.
- Keep permanent prestige rewards separate from time-limited territory power. Existing achievement/badge grant services must own entitlements.
- Admin-only hidden encounter tester in beta: inspect eligible pools, simulate triggers and outcomes, grant/revoke test rewards in test accounts, log every test action; no accidental player-facing exposure.

**Acceptance:** No double grants, no event spam or farmable payouts, hidden tester is permission-checked and beta-only, and cosmetic previews fit existing frame/showcase components.

### Slice G — Balance, abuse hardening, QA & rollout
**Goal:** Deliver safely and tune with data.
- Load test modifier resolution, region rollups, caches and control churn; profile action latency.
- Test alliance hopping, ties, ownership flips during transaction, parallel settlements, zero/large values, stale cached eligibility, paused rounds, round reset, rollback and offline changes.
- Compare pre/post economy, scouting, combat outcomes and territory concentration; tune caps and participation gates via versioned configuration.
- Admin feature flags, metrics, perk activation/revocation audit records, safe disable/rollback path, support diagnostics.
- Run all targeted tests plus typecheck/build and verify mobile/desktop; fix Codex PR review comments and rerun relevant checks before marking ready.
- Beta playtest with controlled regions, identify dominant strategies and document production rollout/round-boundary opt-in.

**Acceptance:** No critical economy exploits, no legacy-round changes, no unexplained applied bonuses, no unresolved blocking Codex review findings, and explicit admin sign-off for enabling on new rounds.

## Suggested implementation order and checkpoints
| Slice | Shippable milestone | Primary focus |
| --- | --- | --- |
| A | Verified data model and catalog | Backend/data |
| B | District perk settlement | Rules/actions |
| C | City ownership bonuses | Rules + UI |
| D | Region tiers and selection | Alliance/region |
| E | Empire Perks dashboard | Player experience |
| F | Exclusive events + cosmetic prestige | Event system |
| G | Hardening and beta rollout | QA/ops |

## Codex/PR review policy
For each slice: commit to a focused branch targeting **beta** (or to beta only when explicitly requested), run applicable tests/typecheck, read **all latest Codex and human inline/general PR review comments**, fix actionable issues, explain any deliberate nonchanges, and recheck threads/checks before merge. Do not claim reviews are cleared without checking.

## Out of scope for A–G
- Replacing Turf ownership/combat, inventing new live cities, resetting rounds or forcing geographic expansions.
- Purchased power bonuses, permanent combat buffs from old round awards, boosts to casino win odds.
- Global territory rebalance without measurements.

## Definition of done
A player can open existing Turf or Alliance UI, see exactly which districts/cities/regions their alliance controls and which passive perks that earns, understand where each effect applies, and verify the resulting action receipt. Losing control immediately stops future qualified payouts. Round rules, anti-abuse limits, event integrations and cosmetics remain auditable.
