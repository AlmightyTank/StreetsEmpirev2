# StreetsEmpire 2.1.0 — Release Roadmap

**Status:** In progress — Slices A–C merged to `beta`. Slice D implements optional proof-backed mentor bonds; see [implementation notes](CREW-LOYALTY-2.1.0-D-MENTOR-BONDS.md). Base future implementation on `beta`; see [Living World Master Roadmap](STREETSEMPIRE-LIVING-WORLD-ROADMAP-2.0-2.7.md) for shared policies and dependencies.

## 2.1.0 — Crew Loyalty & Legends

### Player fantasy and loop

A roster becomes a cast. Crew members already have stable round identities, names, descriptive traits, specialties, XP, training and histories. Extend these records so players remember **who** did the work, not just how many thugs/workers they own.

**Loop:** assign a crew member → complete normal work → earn trust/experience → witness a milestone or personal incident → give an earned nickname → feature that crew legend in the round recap. Keep happiness/upkeep authoritative and separate from loyalty; no mandatory micromanagement.

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.1.0-A** | **Roster identity audit** | Inventory crew assignments, status, stable member IDs, releases, casualty handling, training and history; specify round-vs-account persistence. **Pass:** no lost or phantom crew after roster reconciles. |
| **2.1.0-B** | **Earned loyalty ledger** ([implementation notes](CREW-LOYALTY-2.1.0-B-EARNED-LEDGER.md)) | Compute understandable loyalty/milestones from verified assignments, defensives, completed jobs and care; add daily/weekly caps and reason history. **Pass:** idle check-ins, reassign spam and paid items cannot farm loyalty. |
| **2.1.0-C** | **Personalities & moments** | Add opt-in crew commentary/incident stories using existing descriptive traits. Tie examples to authentic actions without giving undisclosed combat/math bonuses. **Pass:** personalities do not penalize poor RNG or force daily attendance. |
| **2.1.0-D** | **Mentors & crew bonds** | Optional mentor links for veteran-to-newer members, earned training memories and bounded round progression. **Pass:** benefits, if any, are minor, capped and simulation-tested; no permanent earned power. |
| **2.1.0-E** | **Nicknames & legends** | Earn names such as *Corner Keeper* or *Road Veteran* from factual milestones; archived crew biographies and account-level collectible remembrance artwork where eligible. **Pass:** nicknames can be moderated and archive snapshots cannot resurrect active members. |
| **2.1.0-F** | **Crew UI & celebrations** | Roster detail: job, specialty, training, loyalty history and last major moment; optional celebration overlay. **Pass:** large rosters virtualize/paginate and phones remain performant. |
| **2.1.0-G** | **Admin, balance & release** | Crew event provenance, correction tools, legacy snapshots, economy/combat simulation, abuse tests and migrated legacy-roster fallback. **Pass:** tier changes cannot break staffing or roster counts. |

### Guardrails

- Losing a member can remain emotionally meaningful but must not cause new surprise penalties beyond the existing game rules.
- Avoid permanent stat-carryover, paid loyalty shortcuts or a forced daily bond chore.
- Preserve individual crew history while safely anonymizing/moderating user-authored names.

**Definition of done:** A player can identify at least three genuinely different crew histories in a typical round, recognize how a legend was earned, and find it in the end-of-round Legacy without competitive carryover.