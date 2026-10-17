# StreetsEmpire 2.7.0 — Release Roadmap

**Status:** Proposed. Base future implementation on `beta`; see [Living World Master Roadmap](STREETSEMPIRE-LIVING-WORLD-ROADMAP-2.0-2.7.md) for shared policies and dependencies.

## 2.7.0 — Last Stand: Round Finale

### Player fantasy and loop

Turn the final portion of a round into a memorable closing act, without invalidating months/weeks of prior play. Use the existing first-class event lifecycle, Round Aftermath, City Memory, Empire Legacy and Discord recap. Do not introduce a parallel finale clock or separate leaderboard math.

**Loop:** final-week announcement → optional earned final contracts, last city moments and alliance challenges → clear countdown → one canonical close → personal and city cinematic recap → permanent cosmetic/historical record.

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.7.0-A** | **Finale window contract** | Compute configurable end window from actual round duration and pause-aware server clock; coexist with quarter-round and Roll Call events. **Pass:** short rounds and shifted end times never create negative windows. |
| **2.7.0-B** | **Finale story chapters** | Three themed windows (opening call, pressure rises, closing hour) are presentation/mission chapters backed by existing events and city memory. **Pass:** no hidden income boost to late entrants. |
| **2.7.0-C** | **Last Stand objectives** | Mix solo tasks, alliance contributions, turf defense, trade and NPC challenges with equivalent paths and contribution floors. **Pass:** no forced PvP or mandatory massive alliances to enjoy finale. |
| **2.7.0-D** | **Live highlights & standings** | Verified public moments, final-rank snapshots and city milestones with conservative freshness labels. **Pass:** rankings remain authoritative and historical events cannot be rewritten. |
| **2.7.0-E** | **Rewards & unique cosmetic keepsakes** | Cosmetic-only final-event rewards (e.g., Last Stand profile frame, legacy plaque, backdrop or crew remembrance); no permanent combat/economy buffs. **Pass:** Roll Call's final-exclusive shell+crew set stays independent and claim-once. |
| **2.7.0-F** | **Closing experience** | Optional cinematic moment, Downtown Newspaper cover, player highlight reel and deep links to complete Aftermath/Discord recap. **Pass:** no duplicate recap facts or reward claims. |
| **2.7.0-G** | **Operations and launch QA** | Admin preview/test for nonproduction, paused/delayed close and timestamp boundaries, load/collusion tests, fallback for low-population rounds. **Pass:** round close remains atomic and final receipt immutable. |

**Definition of done:** A solo player and an alliance member can both experience the closing act, receive accurate recap/eligibility and claim at most one award per earned milestone; the final close remains safe and reproducible.