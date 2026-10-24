# 2.6.0-D — City and Route Comparison

Slice D extends the existing read-only `GET /api/game/profit-intelligence` response and City Holdings report. It uses current-round records only and applies the selected 1–90 day window to returned trips.

## Comparison data

- **Route results:** returned trips are grouped by the ordered route recorded in their stops. Each group shows trip count, actual trade purchases, actual sales, and `trade delta` (sales minus trip purchases).
- **City results:** recorded trip purchases and sales are grouped by the city where each trade occurred.
- **Current registers:** uncollected `Business.registerCents` is grouped by the current turf city. This is a current balance, not historical income.
- **Cash away:** current wallets from active runs and bankrolls from active boss trips are reported separately and totaled.
- **Observed markets:** the player's latest `CitySighting` is shown with its observation time. Only recorded prices are displayed; this is not a live quote or forecast.

Currency is returned as decimal strings in cents, except recorded market unit prices, which follow the existing integer-cent snapshot format.

## Boundaries

Trade delta excludes the cost of cargo carried from home, launch charges, lodging, incidents, vehicle costs, seized goods, and other trip costs. It is not trip profit. Current registers and away wallets are point-in-time balances, not historic snapshots or earned income. Market observations can be stale. The report does not forecast prices or promise future returns. No city attribution is inferred for ledger business collections whose records lack city attribution.

The response carries comparison version `2.6.0-D1`; Slice B classification and Slice C report versions remain unchanged.
