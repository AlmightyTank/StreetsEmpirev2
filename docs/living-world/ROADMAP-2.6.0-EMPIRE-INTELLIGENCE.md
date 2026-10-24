# StreetsEmpire 2.6.0 — Release Roadmap

**Status:** Slices A–C are merged to `beta`; Slice D is implemented on `feature/2-6-profit-intelligence-d-city-route`; Slice E is implemented on `feature/2-6-profit-intelligence-e-goals`; slices F–G remain proposed. Base future implementation on `beta`; see [Living World Master Roadmap](STREETSEMPIRE-LIVING-WORLD-ROADMAP-2.0-2.7.md) for shared policies and dependencies.

## 2.6.0 — Empire Profit Intelligence

### Player fantasy and loop

Move from scattered cash numbers to an understandable **business intelligence layer**. The backend already has ledger and settled sources for businesses, dealers, product sales, supply, travel, loans, stock and city holdings. Read them; do not invent earnings.

**Loop:** view historical period → identify best/worst operation → inspect cost and risk → compare an alternative → take a normal management action and later see its result.

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.6.0-A** | **Metric inventory and source map** ([source map](./EMPIRE-PROFIT-INTELLIGENCE-2.6.0-A-SOURCE-MAP.md)) | Canonical source per cash flow, attribution to city/route/business, costs vs transfers, refunds/repayments, time cutoff. **Pass:** avoid counting both purchase and transfer as expenses. |
| **2.6.0-B** | **Reconciled reporting projections** ([implementation](./EMPIRE-PROFIT-INTELLIGENCE-2.6.0-B.md)) | Build indexed read-only totals by source/time/city with clearly labeled incomplete or unknown history. **Pass:** global totals reconcile with ledger within defined rules. |
| **2.6.0-C** | **Profit & efficiency views** ([implementation](./EMPIRE-PROFIT-INTELLIGENCE-2.6.0-C.md)) | Realized inflows/outflows, estimated net profit, crew or turn efficiency where measurable, stock tied up and Heat/route risk context. **Pass:** explain estimate assumptions and missing costs. |
| **2.6.0-D** | **City and route comparison** ([implementation](./EMPIRE-PROFIT-INTELLIGENCE-2.6.0-D.md)) | Compare actual historical trip trades by route and city, last observed market prices, current business registers and cash away. **Pass:** trade delta is not called profit; no future price forecasts. |
| **2.6.0-E** | **Optional financial goals** ([implementation](./EMPIRE-PROFIT-INTELLIGENCE-2.6.0-E.md)) | Player-configured minimum liquidity, minimum on-hand product stock, and maximum route purchase thresholds; surfaced in existing Holdings settings. **Pass:** warnings only, no automated trade. |
| **2.6.0-F** | **Holdings/Dashboard UI** | Profit cards, charts, city filters and drilldown to actual receipts; mobile readable and performant. **Pass:** no new redundant main navigation tab. |
| **2.6.0-G** | **Scale, audits & release** | Reconciliation fixtures, frozen-period tests, high-volume aggregation/load QA, safe backfill and explicit unknown-history handling. **Pass:** no runaway query load or fabricated historic figures. |

**Definition of done:** Players can answer **where their last 24 hours of money came from, where it went and which city/operation performed better**, with an auditable path to receipts.