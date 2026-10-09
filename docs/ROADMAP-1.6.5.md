# StreetsEmpire 1.6.5 — Loan Shark & Debt Pressure

## Purpose

1.6.5 adds a risky source of short-term game cash. Players can borrow from an NPC loan shark to cover a supply order, vehicle, property, or another expense, then repay under terms they can inspect before accepting. Repeated borrowing and missed payments can create a serious debt problem, but a hard ceiling on total debt and fees keeps the balance finite and gives players a path back.

**The question:** Is quick cash worth the cost and pressure that come with owing the loan shark?

**Core loop:**

> Review a quote → borrow cash → spend it → repay on schedule → borrow again carefully or face collection pressure

This system uses game cash only. It is an optional financial tool, not a required route through the game economy.

## Design principles

1. **Make the full cost clear before acceptance.** Show the cash received, total amount owed, fee, due dates, current debt, available borrowing room, and late-payment consequences.
2. **Allow players to make costly repeated choices.** A player may take multiple loans while under the debt ceiling. Terms become worse as their outstanding debt or delinquency grows, so stacking loans can dig a large hole.
3. **Set a hard ceiling on total debt.** All active loans and assessed fees count toward one per-player, per-round limit. No sequence of loans can bypass it.
4. **Cap fees and stop compounding.** Late fees may increase debt up to the published fee cap and overall debt ceiling. Do not add interest to interest or charge unlimited recurring fees.
5. **Keep repayment meaningful and understandable.** Support scheduled, partial, and early payments. Show the balance and available credit after each payment.
6. **Give delinquent players a route to recover.** Collection pressure can restrict access and create bounded gameplay consequences, but it must not permanently lock an account or grow an unlimited balance.
7. **Resolve all financial actions on the server.** Borrowing, payment scheduling, fee assessment, and collections must be authoritative, idempotent, auditable, and safe to retry.
8. **Preserve past rounds.** Pin the feature to the 1.6.5 ruleset family. Existing rounds retain their original cash, ledger, and rules behavior.
9. **Prevent debt cycling exploits.** A new loan cannot be used to repay another loan directly. Loan repayment always uses the player's available cash.
10. **Keep it optional.** Players who avoid debt retain access to the established supply and business loops.

## Release shape

Slices **A–B** establish the debt model and readable loan offers. Slices **C–D** add repeat borrowing, repayment, and delinquency. Slices **E–G** add recovery, administration, balance simulation, and the release gate.

Every slice should have a release gate and a pinned ruleset, following the existing StreetsEmpire release pattern. Exact offer amounts, fees, due intervals, debt ceilings, and collection effects are balance values to set through simulation before release.

**Beta progress:** Slice A is implemented on the beta branch: the pinned `classic-og-v1.6.5-a` ruleset, server-owned loan, installment, payment, fee and journal records, one per-round debt ceiling and a separate fee cap read from the ruleset, retry-safe acceptance, repayment, scheduled settlement with partial collection, late-fee assessment, pro-rata early payoff, loan ledger categories, and debt netted out of net worth. Slice B adds the Loan Shark page with three fixed offer tiers, full quotes before acceptance, retry-safe acceptance over the API, active loans, next due dates, payoff amounts and history. Slice C lets loans stack under the one ceiling at escalating prices: fees rise with debt utilization and missed installments, every quote shows its breakdown, and a loan is never taken at a price the player was not shown.

## Proposed slices

| Slice | Theme | Outcome |
| --- | --- | --- |
| **1.6.5-A — Debt Foundation** | Records, invariants, and rulesets | Server-owned loan, installment, payment, and collection records; ledger categories; one total debt ceiling; a separate fee cap; idempotency and historical-ruleset coverage. |
| **1.6.5-B — Loan Offers & Acceptance** | Understand the deal before borrowing | A loan shark page with a small set of clear offers. Each quote displays principal, fee, total owed, schedule, current debt, and available room. Accepting creates the loan and credits cash once. |
| **1.6.5-C — Repeat Borrowing & Escalating Terms** | Let risky choices compound within limits | Players can take multiple loans while under the shared ceiling. Pricing worsens by debt tier and payment history. Loan acceptance reserves the full quoted obligation against the ceiling. |
| **1.6.5-D — Repayment & Delinquency** | Service loans and handle missed due dates | Support scheduled, partial, and early payments. Missed installments become delinquent, apply only disclosed capped fees, and change the player's collection state without unbounded compounding. |
| **1.6.5-E — Collection Pressure & Recovery** | Make trouble serious but recoverable | Delinquency pauses new borrowing and can trigger bounded, player-visible collection consequences. Repayment reduces pressure and restores access; reaching the ceiling stops additional fees and borrowing. |
| **1.6.5-F — Admin, Ledger & Exploit Review** | Operate and audit the system | Add admin views for loan balances, schedules, missed payments, fees, and ledger reconciliation. Corrections are auditable; checks catch duplicate loans, payments, or fee assessments. |
| **1.6.5-G — Balance, Mobile & Release** | Prove the complete loop | Simulate first loans, stacked borrowing, high debt, missed payments, and recovery. Validate cash and ledger totals, phone layouts, historical rulesets, and the final release gate. |

## Slice details

### 1.6.5-A — Debt Foundation

**Status: Implemented on the beta branch as the debt foundation. No offers or player page yet.**

Establish the authoritative debt lifecycle before adding borrowing.

- Define loan offers, accepted loans, scheduled installments, repayments, assessed fees, collection state, and payoff history.
- Track each loan's original principal, quoted fee, remaining principal, fees assessed, total outstanding balance, schedule, status, and ruleset.
- Maintain a per-player, per-round debt ceiling and a separate maximum fee allowance. Total obligations and assessed fees must never exceed the applicable limits.
- Reserve the full quoted repayment obligation against the player's available borrowing room when a loan is accepted. This prevents several individually valid offers from exceeding the total ceiling.
- Record every cash movement with a source and destination: loan proceeds, principal repayment, contract fee, late fee, and any collection payment.
- Make acceptance, installment settlement, manual repayment, and fee assessment safe to retry without duplicate cash or debt changes.
- Keep all balances, due dates, and transitions server-authoritative. Client time must never decide whether a payment is late.
- Pin the system behind a new ruleset. Existing rounds do not receive new loan behavior.

**Gate:** Tests prove that the total obligation never exceeds the debt ceiling, fees never exceed the fee cap, retries cannot duplicate a loan or payment, and historical rulesets remain unchanged.

**As built:**

- **Ruleset.** `classic-og-v1.6.5-a` is 1.6.0-H plus a `loanShark` block, and is now the ruleset new rounds start on. Every earlier ruleset has no `loanShark`, so no loan path, settle or net-worth change reaches it. Opening values, all for 1.6.5-G to tune: a $150,000 debt ceiling, a $15,000 round fee cap, a $7,500 late-fee cap a loan, a $2,500 fee per missed installment, installments every 12 hours, at most 4 installments, and contract fees of at most 40% of the principal.
- **Records.** `Loan` holds the quoted terms, the ruleset it was accepted under, and what has been paid against principal, contract fee and late fees, and how much of the fee was waived. `LoanInstallment` holds each installment's share and due time. `LoanPayment` is the immutable receipt for each payment, split the way it was applied. `LoanFee` records every assessed fee. `LoanEvent` is the journal: acceptance, payment, missed installment, fee, payoff and collection change, each with the debt after it. The player's `loanDebtCents`, assessed fees and collection state live on `RoundPlayer`.
- **Ceiling and fee cap.** A loan's whole obligation (principal plus contract fee) is reserved against the ceiling at acceptance, or the loan is refused. The ceiling and fee cap are read from the round's ruleset every time they apply; they are never snapshotted per player. If a ruleset change ever lowers them below what a player already owes or has been charged, that balance stays owed but cannot grow: new loans are refused and late fees stop. The action pipeline refuses any change that raises debt above the current ceiling. Database checks hold debt and fees at zero or above, and each loan's late fees under its own quoted cap. A loan's late fee and late-fee cap are contract terms and keep their quoted values.
- **Late fees.** A missed installment is charged the loan's fixed late fee once, cut down to the loan's cap, the player's fee cap and the room left under the ceiling. Once any of these is full, the balance stops growing. Fees never earn fees.
- **Settlement.** Installments are settled lazily, under the player's lock, in the action pipeline, by the server clock only. When an installment falls due, the server collects what the loan has due through it: unpaid late fees, any earlier missed installment, and this one. If cash covers it all, the installment is paid. If not, the server takes whatever cash there is toward it, in the payment order below; the installment is then marked missed at its due time, the late fee is assessed, and the loan and player become delinquent. A missed installment stays owed and is collected with the next installment or by any payment.
- **Early payoff (pro-rata).** The contract fee is earned evenly over the loan's term, from acceptance to the last due time, rounded up to the cent. A payment never takes more of the fee than has been earned and not yet paid. Paying a loan off owes the unpaid principal, unpaid late fees and only the earned fee; the unearned fee is waived and comes off the debt with the payoff. Each loan reports its `payoffCents` now. A waiver is forgiven debt, not cash, so it is on the receipt, the loan, its installments and the journal (`PAID_OFF` with `early: true`), but not in the cash ledger. Late fees are never waived.
- **Payments.** Payments are applied in a fixed order: unpaid late fees first, then installments oldest first, with each installment's contract-fee share before its principal. A fee share not yet earned is skipped and that installment's principal paid ahead. A request for more than the payoff amount pays exactly the payoff amount. Payments only ever come from the player's cash, and there is no path from one loan's proceeds to another loan.
- **Retries.** Acceptance and manual payments are replayed by the action id and by a durable request key, and a reused key with different terms is refused. Scheduled payments and late fees are keyed by installment, so a second settle finds nothing to do.
- **Ledger.** `LOAN_PROCEEDS` (loan shark → cash), and `LOAN_PRINCIPAL`, `LOAN_CONTRACT_FEE` and `LOAN_LATE_FEE` (cash → loan shark), with `LOAN_COLLECTION` reserved for 1.6.5-E. Loan proceeds never count toward an earning Job.
- **Net worth.** Debt comes off net worth at the cash weight, rounded up, and net worth never goes below zero, so borrowing cannot buy rank.
- **Reconciliation.** `reconcileLoans` proves that a player's debt equals their loans' balances, that receipts (payments and waivers), installments, fees and the cash ledger agree, and reports debt or fees over the ruleset's current limits. 1.6.5-F will expose it to admins.
- **Server API for 1.6.5-B.** `LoanService.accept` takes server-quoted terms, and `LoanService.repay` takes a cash payment. Neither has a route yet.
- **Tests.** Unit tests cover quotes, schedules, stacking, fee caps, payment order and net worth. A PostgreSQL suite (`LOAN_INTEGRATION=1`) covers replays, parallel acceptance at the ceiling, scheduled collection, a missed installment and recovery, partial collection on a shortfall, fees at every cap, limits read live from the ruleset, partial payments and a pro-rata early payoff, settlement in the action pipeline, and a pre-1.6.5 round.

### 1.6.5-B — Loan Offers & Acceptance

**Status: Implemented on the beta branch.**

Let players understand the contract before taking cash.

- Add a Loan Shark page reachable from the game navigation.
- Start with a small number of fixed offer tiers rather than a player-to-player market.
- For each offer, show:
  - cash received;
  - fixed fee and total payback;
  - installment count and due schedule;
  - current outstanding debt;
  - debt ceiling and remaining room;
  - the effect of missing a payment.
- Refuse an offer cleanly if the resulting obligation would exceed the debt ceiling or if the player is not eligible under the ruleset.
- On acceptance, post the cash proceeds and loan record atomically. Repeated submissions cannot create another loan.
- Show active loans, next due dates, payoff totals, and recent history.

**Gate:** A player can compare offers and see the full obligation before accepting. The accepted loan, player cash, debt balance, and ledger reconcile after retries and reloads.

**As built:**

- **Ruleset.** `classic-og-v1.6.5-b` is 1.6.5-A plus `loanShark.offers`, and is now the ruleset new rounds start on. Three fixed tiers, the same terms for everyone they are open to (BALANCE_APPROXIMATION, for 1.6.5-G):

  | Offer | Cash | Fee | Payback | Installments | Needs net worth |
  | --- | --- | --- | --- | --- | --- |
  | Quick Cash | $10,000 | $1,500 (15%) | $11,500 | 2 × 12h | — |
  | Street Advance | $30,000 | $6,000 (20%) | $36,000 | 3 × 12h | $10,000 |
  | Heavy Bankroll | $75,000 | $22,500 (30%) | $97,500 | 4 × 12h | $50,000 |

  Bigger advances cost more per dollar, so no tier is the automatic pick, and the smallest is open to everyone.
- **Page.** **Loan Shark** (`/game/loans`) is in the game menu under Next Steps for new players. The page shows:
  - **What you owe:** current debt, the ceiling, the room left, late fees charged against the cap, standing, and cash.
  - **Offers:** cash received, fee and fee rate, total payback, schedule, and any net-worth requirement for each offer.
  - **Review the deal:** for the picked offer, every installment and when it falls due, debt and room before and after, cash after, how early payoff works, and exactly what missing an installment costs.
  - **Active loans:** what is still owed on schedule, the payoff amount now, the next due time and amount, late fees, and each installment's status.
  - **History:** recent loan history, and the loans paid off this round.
- **Eligibility.** Checked in a fixed order: who the offer is open to (net worth), then room under the ceiling. An offer that cannot be taken says why in player-facing words, and the server refuses it with the same message (`LOAN_NOT_ELIGIBLE`, `LOAN_DEBT_CEILING`). Net worth is the pipeline's freshly calculated value, not the stored one.
- **Acceptance.** `POST /api/game/loans/accept` takes only `offerKey`, `requestKey` and `actionId`; the terms come from the round's ruleset under the player's lock, after the replay check. A retry with the same request key answers with the loan already made, even if the offer has since become unavailable; the same key for a different offer is refused. The page keeps an unconfirmed attempt's request key across reloads and locks the offers until the result is known.
- **Settlement on read.** Opening any page now settles due loan installments, as it already did for property upkeep, so a player who is only looking sees installments collected on time.
- **Earned fee.** An installment that has fallen due always counts its full fee share as earned, even if its due time moved.
- **Not yet.** Manual payments have a server action (`LoanService.repay`) but no button; 1.6.5-D adds the payment flow. Delinquency does not yet block new loans (1.6.5-E).
- **Tests.** Ruleset and offer-eligibility unit tests, and an HTTP suite (`LOAN_INTEGRATION=1`) covering full quotes, retries and reloads that reconcile, forged terms, ineligible and ceiling refusals with their reasons, settlement on read, and earlier rulesets.

### 1.6.5-C — Repeat Borrowing & Escalating Terms

**Status: Implemented on the beta branch.**

Allow players to stack loans without making the system unlimited.

- Allow another loan while the player has room under the shared debt ceiling and meets the delinquency rules.
- Count every active loan and every unpaid assessed fee toward the same ceiling. Do not create separate limits per offer tier.
- Make later offers more expensive as the player's debt utilization increases or payment history worsens. Display the resulting total cost before acceptance.
- Quote a fixed obligation for each accepted loan. Do not compound fees or silently reprice an existing loan when another loan is taken.
- Do not allow new proceeds to pay another loan directly. The player receives cash and chooses how to spend it; loan repayments use available cash.
- Keep offer access rules deterministic and explain any unavailable offer in player-facing language.

**Gate:** A player can take multiple loans and reach a large balance through poor choices, but cannot exceed the overall debt limit, evade it through parallel contracts, or borrow to manufacture a loan repayment.

**As built:**

- **Ruleset.** `classic-og-v1.6.5-c` is 1.6.5-B plus `loanShark.pricing`, with the most a fee can be raised from 40% to 60% of the cash advanced. It is now the ruleset new rounds start on. The offers and every other limit are B's. All values are BALANCE_APPROXIMATION, for 1.6.5-G.
- **Pricing.** A new loan's fee is the offer's listed fee plus whole points of the cash advanced:

  | Utilization before the loan (owed / limit) | Tier | Surcharge |
  | --- | --- | --- |
  | Under 25% | Clean | — |
  | 25% | Leaning | +4 |
  | 50% | Stretched | +8 |
  | 75% | In deep | +15 |

  On top of the tier, each installment missed this round adds 3 points, to at most 15, whether or not it has been paid since. The total is never more than 60%. Pricing is deterministic and only ever gets dearer as debt or missed installments grow. Without pricing rules (A, B), the listed fee is the fee.
- **Fixed price.** A loan's fee is set at acceptance and stored on the loan. Nothing reprices a loan already taken, and each `ACCEPTED` journal entry records how it was priced: listed fee, utilization, tier, missed installments, surcharges and whether the fee was capped.
- **Quoted price only.** The page prices every offer exactly as acceptance does and shows the breakdown: listed fee, debt surcharge, missed-payment surcharge and cap. The accept request must carry the fee the player was shown (`quotedFeeCents`). If the price has moved since (another loan, a missed installment settling), nothing is taken; the server answers `LOAN_QUOTE_CHANGED` with the new fee, and the page reloads with the new terms. A retry of an attempt that did go through still answers with that loan.
- **One ceiling.** Every loan, at its priced obligation, counts toward the same ceiling; there are no per-tier limits. Parallel acceptances serialize on the player lock, and each is priced and checked against the debt it actually lands on.
- **No loan-to-loan repayment.** Proceeds only ever go to cash. Acceptance has no way to point proceeds at another loan, and taking a loan never changes another loan's balance. Repayments, scheduled or manual, come only from cash.
- **Page.** "What you owe" adds how the shark sees you (tier and surcharge), missed installments and their surcharge, and what the next tier would cost. Offer cards say what their fee includes. The review notes that the price is fixed once taken.
- **Tests.** Engine tests for tiers, history, the cap and monotonic pricing; ruleset tests. An HTTP suite (`LOAN_INTEGRATION=1`) stacks loans into a large balance at rising prices without repricing old ones, refuses a stale quote, raises prices after missed installments (and keeps the record after repayment), holds the ceiling against parallel contracts at mixed prices, and proves proceeds never reach another loan.

### 1.6.5-D — Repayment & Delinquency

Make payments predictable and missed payments consequential.

- Show each installment's amount and due time, the amount currently due, and the total payoff amount.
- Support early payoff and partial payment. Apply payment amounts in a documented order, such as due fees first and then principal, and show the result before confirmation.
- Settle scheduled payments on the server using the game's authoritative clock. Provide a clear receipt for automatic or manual payments.
- Mark an installment delinquent only after its disclosed due time passes.
- Apply a fixed, visible late fee per missed installment, subject to both the loan's fee cap and the player's total debt ceiling.
- Never charge interest on fees, apply invisible daily compounding, or repeatedly assess the same missed-installment fee.
- Keep delinquency status and the next action visible in the loan page and activity history.

**Gate:** A loan can be paid early, partially, or on schedule; a missed payment is recorded once; no settlement can charge more than the outstanding amount; and all cash movements reconcile.

### 1.6.5-E — Collection Pressure & Recovery

Make a deep debt hole matter while ensuring players can climb out.

- Enter a collection state after the configured delinquency threshold, with a clear warning and explanation of what changes.
- Pause access to new loans while the player is delinquent or at the debt ceiling.
- Use bounded collection consequences that do not add unlimited debt or permanently remove the player's ability to play. Candidate effects include temporary limits on new contracts or a capped collection deduction from eligible cash proceeds; choose and simulate the final effect before implementation.
- Stop assessing new fees when the total debt ceiling or fee cap is reached. Collection status may remain active, but the balance cannot keep growing past the cap.
- Let players make payments at any time. Payments reduce the outstanding balance and, when the delinquent amount is cleared, lower collection pressure according to a visible recovery schedule.
- Restore borrowing access only after the required current payments or recovery conditions are met. Do not require a reset, admin action, or new round to recover.
- Show the balance at the ceiling as a finite, actionable payoff target.

**Gate:** A heavily indebted player faces meaningful restrictions, can see a clear path to reduce them, and can recover through play and repayment without an infinite balance or permanent lockout.

### 1.6.5-F — Admin, Ledger & Exploit Review

Provide tools to inspect and safely operate the system.

- Add an admin overview of debt totals, active loans, delinquency, collection states, and assessed fees by round.
- Add player-level inspection for loan contracts, due schedules, payment history, and debt-ceiling use.
- Allow only audited corrections. Corrections must settle the player first, preserve completed history, write an admin activity record, and refuse changes to finished rounds.
- Extend exploit checks for duplicated acceptance, payment, missed-fee assessment, debt-limit bypass, and ledger mismatches.
- Keep admin corrections from silently creating cash, clearing debt, or erasing delinquency history.

**Gate:** Admins can identify the source of a balance, trace every change, and correct a verified error without altering historical records invisibly.

### 1.6.5-G — Balance, Mobile & Release

Prove that the debt system adds tension without overwhelming the economy.

- Simulate new players and established players taking one loan, stacking loans, missing installments, reaching the debt ceiling, and repaying out of delinquency.
- Measure the total game-cash cost of each offer, the share of normal earnings consumed by payments, debt duration, and time to recover.
- Verify a player can reach a serious debt balance through repeated decisions, but no one can exceed the ceiling or fee cap.
- Verify collection consequences matter, remain bounded, and do not make repayment mathematically impossible.
- Reconcile loan records, player cash, installments, fees, collection deductions, and ledger totals in every tested scenario.
- Test historical rulesets to prove the feature does not alter earlier rounds.
- Review the loan page, quote confirmation, payment flow, and history at phone widths with no horizontal scrolling.
- Update release and admin documentation with the final debt, fee, delinquency, and recovery rules.

**Release gates:**

- The full borrow-to-repay loop works without admin intervention.
- Every loan, fee, and payment is visible and reconciles in the ledger.
- Total outstanding debt and fees cannot exceed their hard ceilings.
- Players can make poor borrowing decisions and reach serious debt while retaining a finite payoff path.
- Fees do not compound without limit, and collection cannot permanently lock a player out.
- No direct loan-to-loan repayment, duplicate payout, or debt-limit bypass exists.
- All new behavior is pinned to the 1.6.5 ruleset and mobile layouts are usable.

## Open decisions

- Which game-clock interval should installments use: hours, days, or a small number of scheduled checkpoints?
- Should accepted-loan fees be included in the amount reserved immediately, or should the offer show principal plus a fixed payoff fee due on repayment?
- Which bounded collection consequence best fits StreetsEmpire: temporary contract restrictions, a capped deduction from eligible proceeds, or another non-permanent pressure?
- What should the opening debt ceiling, fee cap, offer tiers, and delinquency threshold be after simulation?
- Should loan availability be immediate, or unlocked by a first-round milestone so new players understand the regular economy first?

## Explicitly deferred

- Player-to-player lending, debt trading, or gifting loan proceeds.
- Infinite interest, interest-on-interest, and uncapped late fees.
- Permanent account lockout, forced account deletion, or debt that carries into a new round.
- Loans that create real-money advantages or can be purchased with premium currency.
- Hidden contract terms or penalties that are not shown before acceptance.

## Guiding question

**1.6.5:** Can quick cash save a plan, or will repeated borrowing put the player's organization under pressure?

The update should make the decision tempting, the cost visible, the consequences serious, and recovery possible.
