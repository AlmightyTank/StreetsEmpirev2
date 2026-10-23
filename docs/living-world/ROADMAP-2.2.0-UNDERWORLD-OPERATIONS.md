# StreetsEmpire 2.2.0 — Release Roadmap

**Status:** Proposed. Base future implementation on `beta`; see [Living World Master Roadmap](STREETSEMPIRE-LIVING-WORLD-ROADMAP-2.0-2.7.md) for shared policies and dependencies.

## 2.2.0 — Underworld Operations 2.0

### Player fantasy and loop

Make the existing **one-template Corner Takeover** operation system into small, tactical cooperative stories. The current driver/enforcer/intel seat model, invite acceptance, execution and deterministic receipt are the starting point. Do not create a second combat or convoy engine.

**Loop:** discover an operation → review eligibility/cost → reserve roles → gather intel/prepare → execute canonical underlying actions → receive one shared settlement and report.

### Starter operations

| Operation | Existing foundations | Differentiator |
| --- | --- | --- |
| **Stash Recovery** | Scout, supply, NPC encounters | Locate and retrieve known limited inventory; no duplication of product stock |
| **Convoy Protection** | Travel, convoy and crew | Choose escort allocation and route risk before real shipment settlement |
| **Block Defense** | Turf, alliance, combat | Cooperative response to a genuine active threat with bounded rewards |
| **The Big Score** | Contacts, intel, operations | Longer opt-in chain requiring diverse contributions; appearance/legacy milestone, not runaway cash |

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.2.0-A** | **Prototype audit** | Check the Corner Takeover state machine, existing seat invitations, cooldown, payout and idempotency. **Pass:** protect already-started operations. |
| **2.2.0-B** | **Versioned operation templates** | Define mission catalog, role requirements, deadlines, cost/reward budgets and branch outcomes; add a Stash Recovery vertical slice. **Pass:** all item/turn/cash flows reconcile. |
| **2.2.0-C** | **Roles & collaborative preparation** | Invite, accept/decline, lock and release roles with compatible alliance/team rules; clear cancel and expiry behavior. **Pass:** two players cannot claim the same seat; invites never override blocking/privacy. |
| **2.2.0-D** | **Multistage execution** | Add optional intel, preparation and action windows; reuse existing combat, turf, travel and product settlement. **Pass:** retry/late result resolves exactly once. |
| **2.2.0-E** | **Success, partial success & failure** | Explain outcome bands and distinct contribution credits; controlled split payouts and nonfarmable failure reports. **Pass:** solo and groups have reasonable balanced choices, not a mandatory alliance. |
| **2.2.0-F** | **Operation command experience** | Mission cards, ready-state checklist, live seat list, clear countdowns, notifications and cinematic receipt. **Pass:** no navigation/scroll jump after action, mobile role status stays in view. |
| **2.2.0-G** | **Admin, anti-abuse & simulation** | Stalled mission repair, invite/collusion limits, reward caps, traceable state machine, large-load tests and flag-gated release. **Pass:** no deadlocks, stock cloning or duplicate rewards. |

**Definition of done:** At least three distinct new templates plus existing Corner Takeover, with a real multi-player end-to-end test, fair solo alternative, and a fully traceable shared receipt.