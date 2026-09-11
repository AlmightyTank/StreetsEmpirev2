# 0.2.0-C recovery raids

Status: implemented for new `classic-og-v0.2-c` rounds. Existing `classic-og-v0.1` and `classic-og-v0.2` rounds keep their pinned behavior; [0.2.0-D](COMBAT-0.2.0-D.md) adds recon and retaliation in a later pinned ruleset.

0.2.0-C turns the A wound model into persistent temporary injuries. A raid still transfers only cash, but contested fights now put some committed thugs into recovery. Wounded thugs remain part of the player's owned crew and net worth; they simply cannot work, cook, attack, or defend until they recover.

## Rules

- Ruleset: `classic-og-v0.2-c` at version `0.2.0-C`.
- Combat model revision: `0.2.0-C.1`.
- Base raid rules: same cash, protection, cooldown, city, target-strength and retry model as 0.2.0-B.
- Wounds: winners take 2% of committed fighters, losers take 8%, capped at 10% of the committed squad.
- Recovery: wounds recover after 120 minutes.
- Medicine treatment: one medicine immediately recovers one wounded thug.
- Active crew: work, production, raids and automatic defense use fit thugs only.
- Owned crew: stores, net worth and total crew display still count wounded thugs as owned.

A defender with no committed fit thugs causes no wounds. Guns remain in inventory while their carriers recover.

## Persistence and settlement

Each wound is stored as a recovery batch tied to the wounded player and, when it came from a raid, the battle. `RoundPlayer.woundedThugs` is a denormalized current total for fast reads, while `CombatInjury` rows hold the recovery schedule.

The normal player settlement path deletes due injury batches, recalculates `woundedThugs`, then derives fit thugs as:

```text
fit thugs = max(0, total thugs - wounded thugs)
```

That same settlement runs before combat, scouting, production, stores, dashboard reads and treatment. Due recoveries therefore cannot heal twice, and stale cached wounded totals are reconciled the next time the player is touched.

## Treatment

`POST /api/game/combat/treat` spends medicine and removes the oldest pending injury batches first. Treatment is idempotent with the same permanent action receipt pattern as raids, so a retry cannot spend medicine twice.

The combat page shows fit thugs, wounded thugs, next natural recovery, medicine on hand and the maximum immediately treatable crew. The dashboard, scout and production pages show fit/wounded counts when anyone is recovering.

## Local QA

Create a C recovery round without changing existing rounds:

```powershell
npm run db:seed:combat:recovery
```

Run the disposable browser fixture:

```powershell
npm run qa:combat:browser
```

The browser fixture now follows the newest combat slice. For C-specific browser checks, seed a recovery round with `npm run db:seed:combat:recovery`; the fixture still gives the raider medicine and supports the lost-response retry check with `d`.

## Verification

Implemented coverage includes:

- B regression: cash-only raids still produce no injuries.
- C raid persistence: wounds are stored, reports include wounds, and total crew/guns remain owned.
- C natural recovery: due injury batches clear through ordinary settlement.
- C fit-crew limits: raids and production use fit thugs, not total thugs.
- C treatment: medicine removes pending injuries once, with retry-safe receipts.
- State invariants: wounded thugs are whole, non-negative, and cannot exceed total thugs.

Useful commands:

```powershell
npm run typecheck
$env:COMBAT_INTEGRATION='1'; npx vitest run apps/server/src/services/__tests__/combat.integration.test.ts
$env:COMBAT_INTEGRATION='1'; npm test
npm run build
```

## Balance notes

The 2% / 8% wound rates and 120-minute recovery clock are the A prototype values made real. Medicine treatment is intentionally simple for this stage so we can observe whether medicine scarcity creates a meaningful choice against its existing infection use. C does not add alliances, travel, non-cash objectives or permanent losses.
