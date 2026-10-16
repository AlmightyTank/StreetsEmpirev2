# StreetsEmpire 2.0.0-G — Living Streets Authoring & Admin Diagnostics

**Base:** merged 2.0.0-F in `beta`. Branch `feature/living-streets-2.0.0-g`.

## Where it lives
Open **Admin → Events** and find **Living Streets · Story Diagnostics** above the existing event calendar/encounter tester. The backend endpoints are exclusively behind `requireAdmin`:

| Method | Path | Effect |
| --- | --- | --- |
| GET | `/api/admin/living-stories?roundId=...` | Pinned catalog, verified recent source IDs, status counts, caps, disabled drafts |
| POST | `/api/admin/living-stories/diagnose` | Read-only explanation for real `RoundPlayer` + persisted `CityMemoryEvent` + story key |
| POST | `/api/admin/living-stories/simulate` | Hypothetical dry-run contract; **no CityMemoryEvent, case, evidence, ledger or payout writes**; records only an admin audit event |
| POST | `/api/admin/living-stories/drafts` | Create or revise a **disabled** authoring proposal with reason and audit record |

### Diagnostics
Reports round-pinned ruleset and version; authored case keys, audience, visibility, expiry and budget; most recent 30 authoritative city-memory source IDs (not their private actor list); sample of up to 500 cases with explicit truncation label; owner/city/round/cooldown caps. Real-source diagnosis evaluates the same pinned ruleset contract as the production invitation pipeline, then the **same quota helper** used by real offers and public opportunities. It explains wrong round/city, private source, actor not involved, pause/expiry, already offered, owner/city/round cap and active-minute cooldown.

The weighting preview explicitly reports **uniform eligibility matches, weight 1**; the system does **not** currently randomly choose between story keys by weighted draw. Do not display fictitious probabilities.

### Safe test and authoring
A dry-run simulator constructs a source in memory and opens an admin-only accessible story preview dialog; it cannot generate actual source receipts or complete a real case. Its audit log captures who tested what, why and the verdict, but contains no confidential clue payload. A real case can only be offered through the already-shipped, verified event writers and the actual player opt-in path.

A new `AdminLivingStoryDraft` table stores disabled proposals, base ruleset version, allowlisted CityMemory trigger kinds, case template, audience/visibility, expiry and bounded reward budget. Draft edits require the expected revision, are audited and rejected when stale. **None of these drafts are used by live trigger lookup.** Publishing requires adding an approved definition to an explicitly new immutable ruleset version, reviewed and pinned only for future rounds. An existing pinned story key cannot be overwritten via drafts.

### QA
1. Apply additive `20261105000000_admin_living_story_drafts` migration, regenerate Prisma client, typecheck/build.
2. Login as administrator and open Events. Confirm non-admin calls to every endpoint receive forbidden.
3. Pick an active round and a real persisted city-memory source; diagnose involved and unrelated players, paused/expired source, owner cap, cooldown, and dedup.
4. Run synthetic war-win preview. Confirm an audit row but **zero new CityMemoryEvent/CriminalCaseFile/CriminalCaseEvidence/EconomyLedgerEntry** rows and no player cash changes.
5. Author disabled `STORY_QA_NEW`, tune revision 1 to 2, retry stale revision and confirm 409. Confirm proposal never appears in player opportunities.
6. Check old pinned 3.0-E and 3.0-F rounds retain exact catalog and budget, even after draft changes.
7. Confirm admin UI mobile widths, keyboard access, errors and read-only source lists.

**Next:** 2.0.0-H replay, abuse simulations, privacy matrix, staged rollout and beta acceptance.
