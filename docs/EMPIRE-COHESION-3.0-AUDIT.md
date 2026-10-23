# Empire Cohesion 3.0 — catalog and control audit

Baseline: `classic-og-v1.8-s` (`packages/rulesets/src/classic-og-v1.8-s/index.ts`), which inherits `classic-og-v1.6-a` and therefore the San Francisco replacement in `classic-og-v1.5-e3`. This is a source audit, not a new modifier catalog or approval of sample perk rates.

## Playable city keys and proposed 3.0 zones

| Zone | Existing `1.8-s` playable keys | Planned additions |
| --- | --- | --- |
| Northeast | `new-york-city` | `boston`, `philadelphia` |
| Midwest | `detroit`, `chicago` | `toronto` |
| South | `miami-beach`, `atlanta`, `tulsa`, `dallas` | `monterrey` |
| West | `seattle`, `san-francisco`, `los-angeles`, `las-vegas` | none |

The eleven existing keys are the eight original keys in `classic-og-v0.5-a/cities.ts` (with `beverly-hills` re-keyed to `san-francisco` by `classic-og-v1.5-e3/index.ts`) plus Chicago, Tulsa and Dallas from `classic-og-v1.6-g/index.ts`. The table assigns each of those eleven keys and each of the four additions **exactly once** (3 + 3 + 5 + 4 = 15 planned cities). `beverly-hills` is **not** in the `1.8-s` seed: `1.5-e3` also re-keyed its hotel, turf, business, casino and law entries and replaced the LA–Beverly Hills and LA–Seattle roads with LA–San Francisco–Seattle. Rounds pinned before that replacement retain their old Beverly Hills data. `mexico-city` is not a playable city key and remains supplier-only in the 3.0 plan. No zone is inferred from a display name.

## Districts, ownership, and records

- The actual `DistrictKey` catalog (`classic-og-v0.1/districts.ts`) is `CASINO`, `WINO_SLUMS`, `LOW_RENT`, `NIGHTCLUB`, `URBAN_GHETTO`. Each city declares all five; each `Turf` is unique by `(roundId, cityId, district)` (`prisma/schema.prisma`). There are no separate industrial/market/transit/residential district keys.
- A `Turf` has a nullable `holderId` to a `RoundPlayer`, not a stored alliance owner. `RoundPlayer.allianceId` supplies current membership; `controlFromRows` in `apps/server/src/services/turf-territory.service.ts` groups held blocks by the holder's **current** alliance, requiring `ceil(rows.length * cityControlShare)` blocks. The inherited `cityControlShare` is `0.6` (`classic-og-v0.6-e/index.ts`), i.e. three of the five districts. Neutral blocks do not count. `TurfControlEvent` stores before/after alliance snapshots; `TurfHoldSegment` stores historical holds. Neither is an alternative current-control source.
- Alliance membership is the existing `Alliance.members` / `RoundPlayer.allianceId` relation, with invites and events on the same alliance. `classic-og-v0.3-c/index.ts` pins `maxMembers: 5` and `leaveCooldownHours: 24` for the seed; `alliance.service.ts` locks the alliance row before checking invite acceptance capacity. No org/sect membership exists or is needed for 3.0.
- Existing per-city holding inputs are `Turf`/`Business`, `SupplySafehouse` (unique by player/city slug), `SupplyWarehouse` (unique by player/city slug/name, including the free home stash), `SupplyStock` (unique by warehouse/product), `DealerCrew` (unique by player/city/district), `DealerStock` (unique by crew/product), plus round/player law records. These records, rather than a new holding row, must remain the source of truth.

## Modifier and admin integration points

- Existing buffs are not one universal pipeline: district pay multipliers and city `districtPay` / legacy `modifiers` live in rulesets; city control already grants street-tax relief (`controlledCityNoTax`); hideout levels affect scout/work/production/defense; `TimedFavorService.bonuses` returns category-specific max active favor; `CityConditionService.bonuses` bounds scheduled city effects to 15% per category; faction perks and logistics crew specialties have their own settlement hooks. `scout.service.ts`, `production.service.ts`, `store.service.ts`, `product-market.service.ts` and `combat.service.ts` are candidate settlement integration points. Audit stacking/rounding for each before registering territory perks; do not modify casino outcome odds.
- Admin entry points include `admin-turf.service.ts` (block overview, posted-thug drift, history and audited release/sync/settle repair), `admin-ruleset.service.ts`, `admin-supply.service.ts`, `admin-law.service.ts`, `admin-event.service.ts` and alliance rename/disband routes. Existing turf diagnostics are not a perk eligibility/source breakdown; task 9.1 must add that without making read paths change ownership.

## Territory-perks roadmap discrepancies

The linked `ROADMAP-TERRITORY-PERKS.md` explicitly labels its catalog and values as proposals. Its industrial/market/transit/residential district examples do not match live keys. Its example Miami city must use the actual `miami-beach` slug; its example regions (Southeast, Southwest, Gulf Coast, etc.) do not match the four pinned 3.0 zones. Its five-city within-region tiers and proposed >50% eligible-district majority are superseded here by strict zone leads counted in **alliance-controlled cities** and the existing three-of-five city threshold. One selected regional perk scales by **zones led**, not cities inside a region. The example +3%, +5%, +8%, +12% and -10% rates/caps are not committed tuning values. San Francisco is already playable; treating Beverly Hills as a current city or San Francisco as a fifth new addition would duplicate/lose historical catalog coverage.
