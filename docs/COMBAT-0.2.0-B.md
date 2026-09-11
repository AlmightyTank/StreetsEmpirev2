# 0.2.0-B cash raids

Status: implemented for new `classic-og-v0.2` rounds. Existing `classic-og-v0.1`
rounds remain economic-only. 0.2.0-C now builds recovery in a separate
`classic-og-v0.2-c` ruleset; B remains cash-only.

0.2.0-B turns the A calculator into a playable cash raid without adding injury
state. A raid spends attacker turns, resolves against the defender's automatic
squad, transfers bounded cash on an attacker win, and writes a permanent battle
receipt for both players.

## Rules

- Ruleset: `classic-og-v0.2` at version `0.2.0`.
- Combat model revision: `0.2.0-B.1`.
- Squad cap: up to 100 attacking thugs; defense automatically fields up to 100.
- Cost: 10 attacker turns on every valid raid, win or lose.
- Loot: 5% of defender cash above $5,000, capped at $100 per attacking thug.
- Defense: defender has a 10% home strength bonus.
- Protection: 24 hours for newcomers, then 6 hours after every raid against the
  defender.
- Return gate: a defender must come back after the last raid before another
  player can attack them.
- Cooldown: attackers wait 30 minutes after a raid.
- Eligibility: same round, same city, exposed target cash, and target full
  deployed strength at full morale must be at least half the attacker's full
  deployed strength.
- Injury model: disabled. Crew and weapons stay with their owners.

The full-strength target check uses available crew and guns at full morale, not
the specific squad being sent. This prevents a strong player from sending one
thug to bypass the weak-target restriction.

## Persistence and retries

Each raid requires an explicit `roundId`, `targetPublicPimpId`, `attackingThugs`
and `actionId`. The service locks both players in a stable order, settles both
resource snapshots in one transaction, applies the raid, updates both net worths
and ranks, writes attacker and defender reports, and reserves the action id for
the lifetime of the raid.

Retrying the same action id returns the original report. Reusing that action id
with a different target or squad is rejected. Action ids are also reserved across
ordinary economic actions, so a lost client response cannot double-spend turns or
double-transfer cash through a retry.

Reports expose each player's own receipt only. Opponent inventory, private cash
balances and raw calculations stay server-side.

## UI

The Raids screen appears in game navigation. Economic-only rounds show a disabled
message. Combat rounds show eligible same-city targets, visible blocking reasons,
the attack form, saved pending raids, retry recovery, and battle reports for
attacks and defenses.

The browser keeps a pending raid in session storage before sending the request.
If the network reply is lost after the server commits, the page can retry the
same action id and recover the original receipt.

## Creating a local combat round

The seed command creates a separate active round named `Game #002 - Cash Raids`
with the new ruleset. It does not convert existing rounds or migrate players
from Game #001.

```powershell
npm run db:seed:combat
```

Run it only when you want the local dev app to enter a combat round.

## Verification

Implemented coverage includes pure combat calculator tests, service helper tests,
PostgreSQL integration tests for two-player atomicity, browser retry QA, and
desktop/mobile layout checks.

Useful commands:

```powershell
npm run qa:combat
npm test
npm run typecheck
npm run build
$env:COMBAT_INTEGRATION='1'; npm test
npm run qa:combat:browser
```

## Known balance limits

0.2.0-B is deliberately cash-only. Use [0.2.0-C](COMBAT-0.2.0-C.md) for persistent wounds and recovery, and [0.2.0-D](COMBAT-0.2.0-D.md) for recon and retaliation. It does not solve
alliances, travel, reserve contribution, broader revenge loops, or coordinated shielding.
The protection and cooldown values are playable defaults to test with real
rounds, not final economy balance.
