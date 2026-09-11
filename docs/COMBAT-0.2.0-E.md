# 0.2.0-E raid onboarding

0.2.0-E starts the usability pass for combat. D made raids strategic with recon and revenge, but a solo local player could still land on an empty target list and the gun requirements were too quiet. E makes the default development round self-contained and makes armed muscle matter on the street.

## Ruleset

- Ruleset: `classic-og-v0.2-e` at version `0.2.0-E`.
- E inherits the full D combat model: immediate raids, recon intel, wounds, medicine treatment and 24-hour revenge windows.
- Missing weapons now cost 3 thug-happiness points each in E. Beer still costs 1 point each.
- E scouting requires armed fit thugs for street coverage. Unarmed thugs still belong to the player, but they do not cover whores on district scouting trips.
- Public boards keep rank order, but opponent exact net worth is hidden in rankings and raid target lists. Opponent profiles also hide exact crew and weapons, so recon is the source of combat-ready numbers.
- The default seed now creates `Game #005 - Raid Onboarding` as the latest active local round.
- Game #005 seeds three inactive local rivals in New York City:
  - Razor Ray: even starter fight.
  - Cashbox Carlo: cash-heavy target with lighter muscle.
  - Iron Maya: stronger defender for testing losses, wounds and treatment.

The rivals are normal `RoundPlayer` rows backed by inactive local accounts. Combat uses the same target list, validation, battle reports, wounds, rankings and intel systems as human players.

## Tooltips

The web UI now adds hover/focus help to resource rows, happiness drags, district coverage, hidden public intel and raid target strength. The goal is to tell the player why a number matters at the moment they are about to act.

## Local testing

Run the normal seed:

```powershell
npm run db:seed
```

Or refresh only the E onboarding round:

```powershell
npm run db:seed:combat:onboarding
```

Re-running either seed refreshes the seeded rivals, clears their combat wounds/protection/reports and sets the round's next public pimp id above the rival ids so new human players do not collide with them.
