# Rivalries 2.5 Source Audit

This audit records the authoritative inputs used by the optional rivalry capability.

| Source | Authoritative receipt | Participation | Settlement timing | Visibility boundary |
| --- | --- | --- | --- | --- |
| Combat | settled combat result/event id | attacker and defender that entered the fight | combat settlement | participant/involved-only unless separately published |
| Retaliation | settled turf-revenge result and push id | revenge attacker and defending holder | turf push settlement | participant/involved-only |
| Turf | `TurfPush`/`TurfHoldSegment` ids | push attacker and defender/holder | push/hold settlement | public facts only; no stock or scout payload |
| Block war | `BlockWar`/`BlockWarFight` settlement ids | declared sides and participating fighters | fight/war settlement | public facts only after moderation |
| NPC encounter | `EncounterGangGrudge` and resolved encounter id | player who resolved the encounter | encounter resolution | involved-only; never a player-vs-player rivalry receipt |
| City memory | `CityMemoryEvent.idempotencyKey` | actors supplied by the authoritative event | event emission after settlement | existing public/involved-only filter |
| Activity | `ActivityService.log` activity id | actor and explicitly recorded participants | transaction commit | activity consumers decide presentation |

Rivalry adapters must pass stable source ids, round id, pinned ruleset id/version, participant ids, the actor's role, outcome category, and settlement timestamp. Chat, passive observation, unparticipating targets, account self-alts, and unverified client payloads are not eligible sources.

The rivalry service is an additive consumer of these receipts. It does not replace combat, turf, block-war, encounter, activity, or city-memory settlement and does not create a second ledger or public feed.
