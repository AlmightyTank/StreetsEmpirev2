# StreetsEmpire 2.0.0-E — Choices, outcomes & fair rewards

**Status:** implementation branch `feature/living-streets-2.0.0-e`, based on `beta` (Slice D merged).

## Conclusion design
Five starter cases have two named conclusions apiece. The chosen ending saves a case-specific narrative and category (contact, intel, peace, discovery or secrecy). No choice starts a combat action, modifies reputation, discloses another player's recon, spends cash, spends turns, or debits crew/inventory. Narrative is a **story receipt**, not a new tactical boost. Branch outcomes are deterministic: no rerolls or hidden random percentages.

### Fair reward and legacy policy
- The new **`classic-og-v3.0-f`** ruleset opts into a maximum **2,500 cents ($25)** for solving any one three-source case, independent of which conclusion is selected.
- Max per player and round: **10,000 cents ($100)**, even if an unexpected bug creates more than the existing four-offer cap. Reward budget is checked against the **round-pinned** story definition and capped in server code.
- `classic-og-v3.0-e` and earlier pinned rounds remain **zero reward**. No retrospective rewards or stat changes when deploying E.
- Settlements require an already `SOLVED`, owned case in an active/unpaused round, a valid predefined branch, and a consistent case/round ruleset.
- Lock order: owner `RoundPlayer` then `CriminalCaseFile`, consistent with gameplay actions. Branch, saved outcome, payout, player cash and ruleset-recomputed net worth (including product inventory, casino commitments and debt), and economy ledger record write **in one transaction**. A replay of the same ending returns the stored case; attempts to switch outcomes after closure return a conflict.
- Closing a case that has hit the global cap remains possible with a **0-cent** result. Refusing an invitation, going offline, expiring while still open or selecting either branch **never subtracts resources**.
- Ledger source: `LIVING_CASE_REWARD`, private metadata only (`caseFileId`, `caseKey`). No automatic public news, alternative grant route, new scheduler or cashless claims.
- `CriminalCaseFile` stores title, summary, category, reward cents and claimed timestamp as the immutable resolved receipt. No hidden generated branch values.
- Private case DTO includes readable `choiceDetails` and final `outcome`, `rewardCents`, `rewardClaimedAt`. Full interactive panel remains F.

### Acceptance/QA
1. Apply additive migration `20261104000000_living_case_outcomes`, validate Prisma and generate client.
2. Run ruleset and case settlement tests, full typecheck, integration and release build.
3. Solve a three-source case and choose either branch. Check exact **2,500-cent** addition to cash and net worth and one positive ledger line.
4. Retry the close request, run two requests concurrently, switch branches after closure and verify a single grant/unchanged original decision. Test a fifth case and capped out balance.
5. Confirm historical `3.0-E` cases close for **0 cents**, no punitive losses on expiry, and users cannot close another player's case.
6. Test admin pause, merged branch, back-office ledger reporting and player-facing case DTO; no public/private intel leakage.
7. Do not overwrite any already-pinned ruleset object or release identifier; offer this ruleset only to newly seeded test rounds.

**Next:** 2.0.0-F makes case choices, reward previews, timeline and resolution readable inside Black Book and Dashboard.
