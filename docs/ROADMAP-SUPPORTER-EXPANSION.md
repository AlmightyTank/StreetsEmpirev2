# StreetsEmpire — Supporter Expansion Roadmap (Slices A–F)

**Target branch:** beta  
**Status:** Planned; this document does not implement or enable these features.  
**Release version:** To be assigned during release planning; do not bump or deploy solely for this roadmap.  
**Prepared:** October 18, 2026  
**Scope:** Priority login queue, advanced personal statistics, exclusive crew banners, additional profile/shell themes, forum cosmetics, and final quality/release work.

> **Decision for this roadmap:** "Priority queue" means **login/game admission when the game has reached a configured concurrent-player capacity**, not staff support-ticket triage. The user can revise this before Slice A starts.

## 1. Outcome

Make StreetsEmpire Supporter feel valuable through **identity, personal customization, convenience, community recognition, and a fair waiting-room experience**, without selling gameplay power or giving subscribers information that changes competitive decisions.

### Existing beta foundation (do not rebuild or regress)

- Permanent Midnight Chrome cosmetic collection for Thug, Hoe, Sedan, Van and Low-Rider; Signature Profile Card, supporter mark and banner accent.
- Monthly supporter title/badge drops, cumulative paid-month tenure badges, and optional public thank-you/release-note credit.
- Supporter polls and previews, and the 10% discount in Crowns on eligible The Drop purchases/Street Pass skips for paid active supporters (not Crown packs).
- Permanent convenience unlocks: 4 profile presets, 4 cosmetic loadouts, 5 notification rule slots, and longer activity/bell histories.
- Stripe and Google Play membership integration, supporter reward granting, active-member checks, admin support tools, Discord role syncing, and forum-facing active Supporter badge data.
- Existing public/personal statistics, Round Aftermath, account/profile appearance, cosmetics locker and Flarum integration. Reuse their actual schemas and availability; avoid overlapping features.

**Source-of-truth starting points:** docs/SUPPORTER-COSMETICS.md; docs/THE-DROP.md; packages/rulesets/src/supporter.ts; apps/server/src/services/active-supporter.service.ts; apps/server/src/services/account-profile.service.ts; apps/server/src/services/profile-badges.service.ts; docs/ROADMAP-FUTURE.md §1.9.

## 2. Core policies

1. **No pay-to-win.** Never sell extra turns/cash/weapons/product, combat or turf strength, faster production, hidden rival intelligence, higher game ranks, better odds, or early entry to a competitive round.
2. **Separate permanent entitlements from subscription-only conveniences.** Already-earned cosmetics and preset/history limits stay permanent. Priority admission is a proposed **active, paid subscription** perk only; a cosmetic unlock or admin-granted badge alone does not grant it.
3. **Respect existing members.** Never disconnect an admitted player to open a spot. Never bypass a scheduled round's public start, maintenance mode, age/verification checks, beta admin approvals, moderation or account bans.
4. **Transparency.** Players know what is cosmetic, what requires active payment, and when a benefit expires. A queue only appears if capacity management is explicitly enabled and actually needed.
5. **Permanence and exclusivity.** New supporter art is account-owned and persists across rounds; never recycle supporter-exclusive reward keys/assets as paid Drop stock.
6. **Accessible mobile-first UX.** Reuse current compact shell/navigation/theme tokens; respect keyboard access, reduced motion and high-contrast viewing.
7. **Deploy separately.** Docs landing on beta is not a promise of release or a code rollout. Each slice requires implementation, tests, review and a feature gate where relevant.

## 3. Proposed release sequence

| Slice | Feature | Starting status | Deliverable |
| --- | --- | --- | --- |
| **A** | Server-capacity waiting room + supporter priority | Not implemented | Safe, fair, capacity-triggered game admission |
| **B** | Advanced personal statistics | Not implemented as a supporter-specific view | Additional read-only personal dashboards built from existing trusted metrics |
| **C** | Exclusive cosmetic crew banners | Partial foundation: supporter profile accent | Equipable, original supporter crew banner visuals |
| **D** | More supporter themes | Partial foundation: Midnight Chrome/profile cosmetics | New account-level profile and full-shell looks |
| **E** | Forum cosmetics & linked identity | Partial foundation: active Supporter forum badge | Supported Flarum flair/theme styling with opt-in visibility |
| **F** | QA, admin tools, documentation & release gates | Not implemented for expansion | Audited, observable release candidate with gradual enablement |

## Slice A — Priority login queue and capacity control

**Objective:** When the game is full, active paid supporters receive preferential **admission**; no subscriber receives additional game actions or a stronger character.

### A1. Capacity and admission model

- Audit current session cookie/auth flow (apps/server/src/routes/auth.routes.ts, apps/server/src/auth/sessions.ts), gameplay authorization hooks, Web/API routing via Nginx, multi-tab behavior and any mobile/browser app access paths.
- Define **admitted player = account holding an unexpired gameplay admission lease**, not a logged-in session (long-lived sessions are not reliable active-player counts). Count one admitted account once across tabs/devices.
- Add admin-configured concurrent admission capacity; **disabled by default** for beta until load-tested. Do not invent a maximum from current traffic or server RAM; choose it from measured load.
- Store short-lived, renewable leases and queued tickets in an appropriate shared server-authoritative store (transaction-safe Postgres or a proven shared cache) so multiple API workers/restarts cannot over-admit. Reclaim stale leases safely and avoid orphaned tickets.
- Define stable ordering, ticket idempotency, ticket reconnect/recovery, server-time expiration, queuing across OAuth/password/2FA login methods, and capacity increase/decrease behavior.
- Scope gating to the authenticated gameplay routes that require admission; keep authentication, account settings/support payments, queue polling, public site, health checks and critical accessibility available. Queue middleware must not block joining the queue or break the billing flow.

### A2. Fair priority policy

- Validate membership server-side through the current paid entitlement source (apps/server/src/services/active-supporter.service.ts), across Stripe and Google Play; **free trials, cosmetic-only/manual awards, unverified billing state and expired memberships are standard queue by default**.
- Two FIFO lanes by enqueue timestamp: **Supporter** and **Standard**. Begin with configurable 3:1 admissions while both have eligible tickets, with at least one standard admission in each four-slot rotation so free players are not starved. This is a planning default, not a tested capacity claim.
- A newly subscribed or renewed account can be promoted in place; a lapsed account drops to standard without losing original enqueue timestamp. Recheck eligibility when admitting, not just when joining.
- No paid reserved game slots, never kick active players, no bypass of admin/banned states, no automatic higher ranking or round start advantage. Everyone already admitted keeps playing.
- Release capacity only when a lease ends/expires or capacity is raised; use atomic claim/lease creation to prevent race conditions, replay and duplicate admissions.

### A3. Waiting-room experience

- Provide a compact queue view consistent with StreetsEmpire desktop/mobile shell, showing lane (if appropriate), position or a clearly qualified estimate, connection status, retry/refresh instructions and safe leave/cancel flow.
- Poll/back off efficiently; do not make downward swipes on mobile trigger accidental refresh, trap scrolling, or cause duplicate queue joins. Support reconnect from background/unstable Wi-Fi.
- Do not show fictional exact wait times. If an ETA is not supported by real measurements, show position/status only.
- Explain clearly: **supporters get queue priority, not early round access**.
- Maintain authentication/security gates when a player is admitted; post-login deep links should resolve to their intended game page.

### A4. Operations, testing and acceptance

- Proposed feature switches (final names during implementation): capacity admission master flag and supporter-priority flag, each off by default; safe fallback when admission infrastructure fails.
- Admin controls: current capacity, admitted/queued counts, oldest ticket age by lane, failed renewals, stale leases, force-clear stuck tickets, audited overrides, and pause/disable queue.
- Load-test two simultaneous API instances, lease expiry/reconnect, 2FA, payment transitions, expired subscriptions, full-capacity concurrency races, joins from multiple devices, malicious direct API requests and restart/recovery.
- **Done when:** full-capacity standard users wait; paid supporters are fairly prioritized; ordinary players continually make progress; an admitted player is never kicked for a supporter; no admission bypass exists; queue can be disabled safely with existing gameplay restored.

**Dependencies:** measurable capacity, common admission source, Nginx/API routing audit and an approved fairness policy. This slice can be postponed until a real capacity constraint exists; a fake queue is not a supporter benefit.

## Slice B — Expanded supporter personal statistics

**Objective:** Give supporters deeper **read-only presentation of their own activity**, not a private competitive intelligence service.

- Inventory stats already in apps/server/services/season-stats, community/profile APIs and Round Aftermath. Publish a metric contract (source, units, time window, historical coverage and privacy).
- Deliver a **My Empire Insights** panel with supported charts for personal cash flow, personal crew/territory milestones, casino outcomes, accomplishments, and trends where there is reliable source data.
- Filter by current/past rounds and metric categories where persisted data permits; use actual server snapshots, not estimated events.
- Keep all existing public standings, personal totals, fair-play/strategy signals and earned awards visible to free accounts. Supporters get **alternate visualization, grouping, history convenience and export of their own authorized data**, not withheld gameplay facts.
- Unavailable metrics must read **Not recorded** (never silently show zero). Redact private IDs, friends' private telemetry and unreleased round intelligence.
- **Done when:** comparison views reconcile with canonical current/archived stats, are read-only, don't leak other players' data, and remain legible on mobile.

## Slice C — Supporter crew banner cosmetics

**Objective:** Create a real crew-banner cosmetic system beyond today's profile-only supporter banner accent.

- Inventory existing crew identity, crew name, player color, cosmetic inventory, crew preview assets and public profile/hover rendering.
- Author an original **Midnight Chrome Crew Banner** with responsive portrait and landscape treatments; optional themed banner variants must have independent permanent cosmetic keys.
- Add cosmetic entitlement, preview, locker selection and stable settings persistence. The visual appears in applicable crew header/profile/showcase surfaces without changing gameplay tiles, hit targets or readability.
- A banner is never a tactical disguise or alliance ownership signal: keep required crew names, team colors and identifiers recognizable.
- Add default and locked previews, fallback rendering for old clients and art coverage tests. Respect reduced motion.
- **Done when:** supporters can select, preview and retain a crew banner across devices/rounds; nonowners can't equip it; mobile and desktop layouts remain compact.

## Slice D — More exclusive profile and shell themes

**Objective:** Give more personality than a single Midnight Chrome look without fragmenting the game's established shell design.

- Create a **small original curated set** (proposed art directions, not approved SKUs): Neon Afterhours, Blacktop Royalty, and Crimson Circuit. Final names/art reviewed against existing Drop, Street Pass and achievement catalogues to avoid collisions.
- Each theme uses current site/theme/accent tokens instead of hard-coded page overrides. Apply across dashboard, action panels, casino, store, navigation, mobile shell and profile where applicable.
- Add preview-before-equip, account-level saved selection and responsive art variations. Restore a legible default if an asset is unavailable.
- Maintain contrast, tap targets, reduced-motion fallbacks, no janky mobile scrolling, and a consistent height for cash/turns/heat quick stats.
- Decide whether new themes are one-time permanent supporter unlocks or specific monthly limited drops **before** publishing any entitlement; no retroactive removal of paid rewards.
- **Done when:** themes look cohesive across major screens, survive page navigation/reload, and never affect behavior/stats.

## Slice E — Linked forum cosmetics and community identity

**Objective:** Carry supporter identity onto forum.streetsempire.dev without exposing billing data or requiring a player to use the forum.

- Reuse existing Flarum linking and apps/server/src/services/profile-badges.service.ts: an active Supporter flair already exists in game-provided forum badge data.
- Audit which avatar frames, user badges, profile borders, nameplates or CSS tokens are **actually supported** by current Flarum extensions/API. Do not assume an unsupported Flarum server write API; scope a small extension if necessary.
- Implement original forum-only decorative supporter badge/nameplate/frame and optional selected game-avatar frame mirror, with account-link verification and user opt-in.
- Active **status** indicators expire correctly with billing status. Independently, account-owned supporter cosmetics stay owned even after cancellation; visually distinguish "past supporter cosmetic" from "currently supporting" to avoid deceptive flair.
- Queue/retry cross-service synchronization idempotently, with admin diagnostic visibility; survive forum downtime and unlinked/relinked accounts, and avoid leaking payment dates, invoices or personal contact info.
- **Done when:** a linked account sees the chosen cosmetics where Flarum actually supports them, can turn off visibility, and doesn't need manual syncing for ordinary status transitions.

## Slice F — Admin, reliability and release polish

- Add a centralized supporter-benefits entitlement view showing permanent grants, active/paid state, queue eligibility, monthly drops, theme/banner ownership and forum sync status.
- Ensure Stripe/Google Play trial, grace-period, cancellation, refund and restore behavior matches each benefit's stated policy. Existing permanent unlocks must never be revoked by a billing-state transition.
- Add automated integration tests for unauthorized equip/queue skipping, race conditions, concurrency fairness, absence of competitive advantage, duplicate webhook events, multi-account/session reconnect, and sync retries.
- E2E mobile/desktop coverage at 360/390/768/1024/1440 widths including Android browser/PWA, scrolling, dark/light accents, reduced motion, keyboard navigation and page deep links.
- Verify release/CI and code-review feedback; document rollout flags, migration/rollback order, load-test thresholds and on-call runbook. Do not merge feature code before required checks pass.
- Update in-game Account → Supporting page to show **available now**, **requires active paid support**, **earned permanently**, and **coming later** accurately; avoid promising unfinished features as live.
- Roll out on beta with safe-off gates and test accounts first, verify production prerequisites before any live activation. No automatic bump to main.
- **Done when:** each benefit is independently verifiable, disabled paths preserve existing behavior, telemetry catches stalled queues/sync, and release notes accurately distinguish shipped from planned.

## 4. Cross-cutting ownership and data contracts

| Concern | Likely integration | Rules |
| --- | --- | --- |
| Membership eligibility | ActiveSupporterService and Stripe/Google Play records | Use a single, tested paid-state policy per active-only perk; do not infer payment from permanent cosmetics |
| Permanent ownership | AccountCosmeticUnlock, supporter catalogue and cosmetics settings | Grant idempotently, preserve across rounds and cancellation, prevent Drop catalogue collisions |
| Admission | Auth/session routes, Fastify gameplay hooks, persisted admission leases, Nginx routing | Consistent across all ways to reach the game; server is authoritative |
| Stats | Season stats, profile and Round Aftermath services | Read-only; no hidden competitive intelligence; honest missing-data labels |
| Profile/crew art | Cosmetics renderers, locker, account settings, profile hover and shell styles | Preserve asset coverage and accessibility |
| Forum | Existing Flarum link and forum-facing badge services | Opt-in visible cosmetics, no payment leakage, safe retries |
| Admin/observability | Admin Supporters, auditing, CI and deployment runbooks | Feature gates, warnings, rollback and transparent status |

## 5. Acceptance and non-goals

**Release checklist for each slice:**

- [ ] Separate code PR against the latest beta head; no direct change to main.
- [ ] Existing supporter features and free-player feature paths remain functional.
- [ ] Typed API contract, validation, authorization, test coverage, UI empty/error states.
- [ ] Small-screen UX and scroll behavior manually verified; no unearned advantages.
- [ ] Migrations reviewed for data safety and repeatability where applicable.
- [ ] Required CI, review comments and operational docs resolved before merging.
- [ ] Player-facing text and supporter information updated only when shipped.

**Out of scope:** paid early access to new seasons; kicking free players; extra turns or strength; private opponent intelligence; paid-only essential settings; exclusive gameplay markets; automated live deployment; rebuilding the existing supporter payment system.

## 6. Suggested implementation order

Start with a short Slice A capacity feasibility pass. **If real capacity pressure or the necessary admission infrastructure is absent, keep Slice A documented but dormant**, and deliver B → C → D → E first; return to A only when an actual waiting room is justified. Otherwise implement A → B → C → D → E → F in order. All slices remain independently reviewable and mergable.
