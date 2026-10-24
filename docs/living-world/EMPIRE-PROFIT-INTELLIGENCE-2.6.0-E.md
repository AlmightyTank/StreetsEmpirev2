# 2.6.0-E — Optional Financial Goals

Slice E adds player-configured thresholds to the existing City Holdings report. Goals are scoped to the player's current round and survive page reloads. An empty goal set is the default.

## Configurable thresholds

- **Minimum liquidity:** wallet cash, active run wallets, boss trip bankrolls, and current business registers combined.
- **Minimum on-hand product:** the chosen product's units in the player's warehouses and dealer crews. Inbound shipments and stock on active runs are excluded.
- **Maximum route purchases:** the largest aggregate buy spend for any route in the selected report period.

The Holdings page shows the current measured value and a warning when an enabled threshold is crossed. Thresholds are optional and can be cleared independently. Warnings are informational; they do not create orders, change routes, or execute trades.

## API and data rules

- `PUT /api/game/profit-intelligence/goals` saves all threshold settings for the authenticated player's active round.
- `GET /api/game/profit-intelligence?days=n` returns saved settings, current measured values, and threshold warnings.
- Currency values are decimal strings in integer cents. Product keys are checked against the active round's ruleset.
- Route purchase warnings use actual completed-trip trade receipts in the selected period. The spend figure is not total route cost or a profit measure.
- The goals row is one-to-one with `RoundPlayer`, cascades with its round record, and contains no account-wide data.
