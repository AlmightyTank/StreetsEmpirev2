# 0.2.0-E raid onboarding

0.2.0-E starts the usability pass for combat. D made raids strategic with recon and revenge, but a solo local player could still land on an empty target list and the gun requirements were too quiet. E makes the default development round self-contained and makes armed muscle matter on the street.

## Ruleset

- Ruleset: `classic-og-v0.2-e` at version `0.2.0-E`.
- E inherits the full D combat model: immediate raids, recon intel, wounds, medicine treatment and 24-hour revenge windows.
- Missing weapons now cost 3 thug-happiness points each in E. Beer still costs 1 point each.
- E scouting requires armed fit thugs for street coverage. Unarmed thugs still belong to the player, but they do not cover whores on district scouting trips.
- E raid loot is tuned higher than D for onboarding: successful raids roll a 5%-40% cut of exposed cash and crack, weighted toward lower rolls so 40% can happen but is rare. Cash is capped at $250 per fit attacker who makes it home, and crack is capped at 5 rocks per fit attacker.
- Public boards and profiles show bragging information: exact net worth, current rank, rank tenure, daily movement, prior ended-round results and achievements. Profiles show the full achievement catalog with earned cards and locked progress across rank, wealth, combat, intel, reputation and legacy. Rankings stay compact by showing only a few featured earned achievements. Opponent crew, weapons, exposed cash and crack stash stay private, so recon remains the source of combat-ready numbers. Repeated back-to-back hits on the same defender reduce the loot roll by 25% each repeat, down to a 25% multiplier; hitting another target resets the repeat penalty.
- The default seed now creates `Game #005 - Raid Onboarding` as the latest active local round.
- Game #005 seeds three inactive local rivals in New York City:
  - Razor Ray: even starter fight.
  - Cashbox Carlo: cash-and-crack-heavy target with lighter muscle.
  - Iron Maya: stronger defender for testing losses, wounds and treatment.

The rivals are normal `RoundPlayer` rows backed by inactive local accounts. Combat uses the same target list, validation, battle reports, wounds, rankings and intel systems as human players.

## Tooltips

The web UI now adds hover/focus help to resource rows, happiness drags, district coverage, public ranking context and raid target strength. The goal is to tell the player why a number matters at the moment they are about to act.

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

## Drive-bys

E adds a second attack at combat version `0.2.0-E.2`. A raid robs; a drive-by weakens. It takes no cash or crack.

- **Cost and seats.** 5 turns. Needs at least one Low-Rider, and each car seats 6 shooters (`lowRiderThugCapacity`), so the squad is capped at `min(fit thugs, cars × 6, squad cap)`.
- **The exchange.** Same strength model as a raid, but only 50% of the target's fit crew (rounded up) is out front and they get no home advantage (multiplier 1.0 instead of 1.1). A carload of six pistols beats a matched ten-pistol starter crew over 90% of the time.
- **A hit** wounds a rolled 10%–40% of the target's fit thugs (normal 120-minute recovery, medicine treats them) and kills a rolled 2%–15% of their whores for good. Both rolls are weighted low like raid loot, and each shooter can drop at most one thug and one whore, so one car never empties a large house. This is the first combat outcome that is permanent.
- **A miss** lands nothing on the target; their crew takes ordinary winner's wounds. Each shooter's chance of going down is `20% + 60% × (their strength ÷ yours − 1)`, capped at 90%, so being badly outgunned is where the losses come from. On a hit it is a flat 5% from return fire.
- **Cars.** Casualties are rolled per shooter, car by car. Cars fill six at a time with the remainder in the last one. A car is lost only when everybody in it went down; if one of them makes it back, so does the car. A half-empty car is the one most at risk. Everyone who went down is wounded, not killed.
- **Clocks.** Drive-bys run on their own clocks so one can set up a raid: the shooter waits 60 minutes between drive-bys (separate from the raid cooldown), and a block that was hit is shielded from drive-bys, but not raids, for 6 hours. The raid rule that an offline defender must return before the next attack applies to drive-bys too, as do newcomer/raid protection and the minimum-strength rule. Revenge and its bypasses count drive-bys.
- **Records.** Drive-bys share `RaidBattle` with a `kind` column (`RAID` | `DRIVE_BY`), so reports, replay safety and revenge see both. They do not count as raid repeats for the loot penalty, and they do not count toward raid achievements.

Charlie's favour in E is now **Take it for a spin**: buy a Low-Rider and do one drive-by, landed or not. Six thugs fit in each car. Charlie does not take the car afterwards; if everyone in a car goes down during the drive-by, the car is lost, and if one thug makes it back, the car comes home too. Economic rounds without drive-bys keep **Back on the lot**.

## Public achievements

Profiles now expose a broader achievement gallery instead of a short awards list. The first catalog includes rank badges, wealth milestones, raid attempts, attack wins, incoming raids, defense wins, recon volume, trader favor progress, weapon unlocks and past-round legacy. Locked achievements show progress so players have a reason to open profiles even when a rival has no private combat intel revealed.
