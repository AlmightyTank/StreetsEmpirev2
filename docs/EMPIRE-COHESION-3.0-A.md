# 3.0-A: City holdings

`classic-og-v1.9-a` inherits `classic-og-v1.8-s` without changing old rounds. The authenticated `GET /game/holdings` read endpoint and `/game/holdings` card exist only in 1.9 rounds; older rounds receive `HOLDINGS_UNAVAILABLE`. Dashboard navigation is gated by the round's pinned ruleset ID. Existing `/game/turf`, `/game/supply`, `/game/dealers` and `/game#pressure` links remain the management destinations.

The holding is a read model, not another inventory or owner: turf holder, operating block businesses, warehouse/safehouse, dealer crew/inventory, pending pickups and city case records are queried from authoritative tables. No holding rows are inserted, stock is transferred, or cash/net worth is recalculated. Warehouse and safehouse upkeep-due and foothold state use the existing property boundary rules. Law pressure is cooled on read using pinned city law rules, without updating the case.

The A-slice modifiers are identity (`1` for dealer pace, demand and upkeep). Read diagnostics flag unknown cities, duplicate held corners and negative stored/crew/inbound quantities. `reconciledHoldingModifiers` fails closed to identity if any discrepancy is present; later tuned slices must use this check before enabling a holding modifier at settlement, with their own authoritative settlement checks. Diagnostics are informational in A: staff should correct the source record through audited existing tools rather than write a second holding total. Perks, contribution and regional effects do not activate in A.

Coverage: ruleset/old-round gating, read-only parallel aggregation, physical stock/pressure/upkeep and drift fail-closed unit tests. See `docs/EMPIRE-COHESION-3.0-AUDIT.md` for city-key and district-key audit.
