# 2.6.0-F — Holdings and Dashboard Views

Slice F completes the profit intelligence experience inside the existing City Holdings page. It adds a city filter, a compact daily cash movement chart, source summaries, and drilldown to the authenticated player's underlying ledger receipts. It does not add a main navigation item.

## Player views

- One city filter scopes ledger totals, cash margin estimate, stock units, daily trend, source totals, and city/route comparison rows. Empire-wide away cash and financial goal warnings remain explicitly global.
- The daily trend draws actual recorded inflows and outflows from the existing reconciled day/source/city projection. A tabular text summary remains visible beside the bars.
- Source summaries open actual ledger receipts, including timestamp, label, source, amount, city attribution, and receipt id. Results are scoped to the signed-in player and reporting period, ordered newest first, and paginated in groups of at most 100.
- Receipt filters support known cities and the unattributed bucket. Unsupported city metadata remains unattributed; no city is inferred.
- Layout uses compact rows and a narrow-screen reflow for mobile.

## API

- `GET /api/game/profit-intelligence/receipts?days=30&source=BUSINESS_INCOME&city=chicago&limit=50&cursor=...`
- `days` uses the same 1–90 day, round-clipped period as the main report. `source`, `city`, and cursor are optional; limit defaults to 50 and caps at 100.
- Cursor ids must resolve to a receipt for the authenticated player inside the requested period and filter. The endpoint never accepts another player's id.

## Performance and audit

The chart uses the existing aggregated report response. Ledger detail is fetched only when a player opens a source drilldown. Receipt reads use indexed player/time filters, deterministic keyset pagination, and no writes or settlement actions.
