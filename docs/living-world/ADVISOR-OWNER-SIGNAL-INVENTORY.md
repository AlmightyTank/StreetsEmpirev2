# Empire Advisor owner-signal inventory

The 2.3 advisor may read only the signed-in player's settled state:

| Signal | Existing source |
|---|---|
| Cash | `PlayerStateService.settle`; `RoundPlayer.cashCents` |
| Turns | `PlayerStateService.settle`; `TurnSettlement` (`turns`, `turnCap`) |
| Crew | `RoundPlayer.thugs`, `RoundPlayer.whores`, and the existing crew services |
| Heat | `RoundPlayer.heat`; `ruleset.heat` |
| Quest status | `HandcraftedQuestService` / the player's own quest rows and activity |
| Stock | `PlayerStateService.settle`; `RoundPlayer` product fields and settled product map |
| City holdings | `CityHoldingsService.read`, scoped by round and player id |

The allowlist explicitly excludes scout reports, combat recon, another player's
stock or defenses, and Black Book rival fields. The advisor assembler accepts
only this owner snapshot and does not receive an enemy or rival object.
