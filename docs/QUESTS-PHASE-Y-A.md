# Quest Phase Y-A — Rare Legendary Favors

Phase Y-A introduces Legendary favors as a scarce endgame reward tier without
creating a second favor runtime.

## Goals

- Make a Legendary marker immediately recognizable in the Quest UI.
- Keep activation, category locking, idempotency and successful-action
  consumption identical to normal favors.
- Keep Phase X admin favor enable/disable controls effective.
- Make normal rounds unable to farm Legendary favors from repeatable contracts.
- Keep older pinned rulesets unchanged.

## Rarity

`FavorDefinition.rarity` is catalog metadata. Existing favors omit it and are
served to the client as `COMMON`. The catalog supports
`COMMON / UNCOMMON / RARE / EPIC / LEGENDARY` so future content can expand the
presentation ladder without another data-shape migration.

The inventory UI marks Legendary entries with `★ Legendary`, and quest reward
labels do the same.

## Legendary catalog

| Favor | Contact | Category | Activation | Effect |
| --- | --- | --- | --- | --- |
| Ghost Network | Mama King | STREET | Timed, 5 min | +50% Scout income, +30% Scout recruitment |
| Pip's Black Book | Pip | UNDERWORLD | Timed, 5 min | 25% off eligible Pip product buys |
| Tommy's War Chest | Tommy | MUSCLE | Single-use | 35% off the next eligible Tommy weapon order |

All three use existing effect kinds. Pip's Black Book therefore keeps the
existing buy/sell anti-arbitrage floor, and Tommy's War Chest is consumed only
inside a successful matching store transaction.

## Acquisition

Legendary favors are intentionally not placed in Daily, Weekly, dynamic City,
Alliance or Community Event repeatable reward pools.

- **Ghost Network** — one copy from Mama's new Kingpin Contract, **The Quiet Hour**.
- **Pip's Black Book** — one copy added to **Top Shelf**.
- **Tommy's War Chest** — one copy added to **Full Rack**.

All sources are `ONCE` jobs in the pinned 0.7-V ruleset. Admin support can
still grant/remove the items through Phase X tooling when needed.

## The Quiet Hour

Mama's missing endgame capstone becomes available after **House Full** at 80
Mama reputation. It requires:

- 60 Scout turns
- $100,000 earned from Scout trips
- 20 recruits from Scout trips
- optional bonus state: 30 armed, fit thugs

Rewards are $50,000, one Ghost Network marker and +25 Mama reputation.

## Compatibility

- New ruleset: `classic-og-v0.7-v` / `0.7.0-V`
- 0.7-U and older pinned rounds keep their existing favor catalogs and rewards.
- No Prisma migration is required; rarity and effects live in the ruleset
  catalog while ownership continues to use the existing `PlayerFavor`,
  `PlayerActiveFavor` and `PlayerArmedFavor` rows.
