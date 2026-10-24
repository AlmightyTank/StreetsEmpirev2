# 2.6.0-C — Profit and Efficiency Views

Slice C adds an estimate panel to the existing City Holdings page and extends the 2.6 profit report response.

## Player-facing figures

- Recorded ledger inflows and outflows remain the reconciled cash movement totals from Slice B.
- **Known cash margin estimate** counts only recorded inflows classified as operating income or inventory proceeds, less recorded operating costs and fines/fees.
- **Dealer net sales / wages** compares dealer sales after crew cut with recorded dealer wages in the selected period. It is a wage-coverage ratio, not dealer profit, because inventory cost of goods sold is not yet matched.
- **Inventory on hand** counts current warehouse and dealer-crew units. It does not display a cash valuation without a reliable acquisition-cost basis.
- Existing per-city law pressure remains visible on each holdings card. This slice does not calculate route risk or turn efficiency; those measures are explicitly marked unavailable.

The report supports 1, 7, 30, and 90 day windows on the page. Every estimate is labeled incomplete, explains what it includes, and lists material exclusions. It never turns transfers, financing, rewards, unknown sources, or mixed entries into earnings.

## Estimate rules

Refunds recorded on a recognized cost source, such as a shortened hotel stay, offset that source's costs in the selected window. Positive entries are not silently discarded.

The estimate is intentionally conservative and descriptive. It is an operating cash-margin estimate, not accounting profit or a forecast. It excludes asset acquisition, financing, transfers, rewards, corrections, mixed rows, and unknown sources. It also excludes uncollected business registers and inventory cost basis. Because dealer proceeds are already net of crew cut, dealer cut is not subtracted again; wages are shown separately.

No settlement is triggered by viewing this report. No schema migration or backfill is added.
