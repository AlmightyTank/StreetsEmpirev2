# 0.2.0-D strategy raids

0.2.0-D is the first strategy slice on top of recovery raids. It keeps the C cash and wound model, then adds two player decisions around timing: spend turns to scout a target before attacking, and answer a recent attacker while the revenge window is open.

## Ruleset

- Ruleset: `classic-og-v0.2-d` at version `0.2.0-D`.
- Combat model revision: `0.2.0-D.1`.
- Newcomer protection is 0 hours for this strategy test, so fresh D-round players can try raids immediately.
- D-round players start with $20,000, 10 thugs, 10 pistols and 5 medicine. Earlier rulesets keep the classic $5,000, one-thug start.
- Recon costs 2 turns.
- Recon intel expires after 60 minutes.
- Revenge windows last 24 hours.
- A revenge attack can bypass target protection and the minimum target-strength restriction, but it still requires the same round, same city, exposed cash, a valid attacker, available turns and the normal attacker cooldown.

Existing rounds stay pinned to their own ruleset. B remains cash-only, C keeps recovery without recon, and D is opt-in for new strategy rounds.

## Recon

`POST /api/game/combat/recon` locks the observer and target in the same canonical order as raids, settles both players, spends the recon turn cost once, and upserts one `CombatIntel` row per observer-target pair. The stored report includes:

- target public pimp id and display name
- fit and wounded thugs
- full-strength estimate using the same equipped-crew model as targeting
- visible weapon counts
- cash band
- estimated maximum exposed cash loot for one successful raid
- creation and expiry timestamps

Recon uses the permanent `ProcessedAction` receipt namespace. Retrying the same `actionId` returns the original report and cannot spend turns twice. Reusing a recon id for a different action is rejected.

## Revenge windows

When the combat page builds targets or a raid request validates a defender, it checks recent `RaidBattle` rows where the current player was the defender and the target was the attacker. If that battle is inside the D revenge window, the target is marked with `revengeAvailable`.

The revenge flag is narrow on purpose. It only bypasses target-side protection and the "too weak" filter so a defender can answer a hit. It does not bypass:

- attacker newcomer protection
- attacker cooldown
- turn cost
- self/cross-account/cross-round checks
- same-city targeting
- the exposed-cash floor
- the offline defender must return rule

That keeps revenge from becoming a general shield breaker while still solving the most frustrating case: someone hits you, immediately gains protection, and becomes untouchable.

## UI and QA

The raid screen now shows a recon button for D rounds, persisted intel under the selected target, and a revenge marker in the target list. Battle reports mark retaliation attacks for the attacker.

Local setup:

```powershell
npm run db:seed:combat:strategy
npm run qa:combat:browser
```

The browser fixture now creates a disposable D round with two accounts. Use it to confirm login, target selection, recon, persisted intel after refresh, ordinary raids, recovery treatment and dropped-reply raid replay.

Focused validation:

```powershell
$env:COMBAT_INTEGRATION='1'
npx vitest run apps/server/src/services/__tests__/combat.integration.test.ts
Remove-Item Env:COMBAT_INTEGRATION
```
