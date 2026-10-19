# Supporter expansion release runbook

This runbook covers the A–F supporter expansion rollout. It is deliberately
safe for beta: every new capability is cosmetic or read-only, and capacity
priority remains off unless an operator explicitly enables both admission
gates.

## Before rollout

- Run `npx prisma migrate deploy` against the staging database, then run
  `npx prisma generate` and `npm run typecheck`.
- Run the focused supporter tests and the full server/web test suites.
- Verify Stripe and Google Play test accounts for: trial, active paid,
  grace/payment-failing, cancel-at-period-end, canceled, refunded, restored,
  duplicate webhook, and manual grant.
- Check `/api/supporter/benefits` as a free account, trial account, active paid
  account, canceled account with permanent rewards, and manually granted
  account. It must distinguish **available now**, **active paid**, **earned
  permanently**, and **coming later**.
- Confirm no response includes payment dates, invoices, provider tokens,
  contact details, or another player’s telemetry.

## Safe beta rollout

1. Keep `ADMISSION_CAPACITY_ENABLED=false` and
   `ADMISSION_SUPPORTER_PRIORITY_ENABLED=false`.
2. Enable supporter cosmetics, insights, and forum pull-through for internal
   test accounts first. These features do not grant gameplay power.
3. Verify profile/theme/banner selection survives logout, reload, round change,
   unlink/relink, and a temporary forum outage.
4. If capacity is needed, enable the master gate first, observe queue metrics,
   then enable paid priority. Roll back by disabling the priority gate, then
   the master gate; existing leases expire safely.

## Admin checks

- Admin → Supporters → **Benefits health** shows active paid accounts,
  permanent reward accounts, linked/opted-in forum accounts, and queue state.
- `/api/admin/supporters/benefits` must report `writesToFlarum: false`.
- Forum cosmetics are pull-through and stateless. A Flarum outage must not
  block game login, billing, unlink, or ordinary profile use.
- Permanent unlocks remain owned after cancellation; active queue/forum status
  must turn off when paid eligibility expires.

## Rollback and migration notes

- Cosmetic catalog additions are additive and can remain owned if a visual is
  temporarily removed; clients fall back to the default theme/frame.
- Do not delete entitlement rows during rollback.
- Roll back application code first if a route or UI issue appears. Keep the
  additive profile columns and migrations; older code ignores them safely.
- For a database rollback, use the normal migration backup procedure. Never
  hand-edit supporter entitlement or payment rows.

## Release acceptance matrix

Check the dashboard and account/supporting flows at 360, 390, 768, 1024, and
1440px, in a desktop browser and Android/PWA shell. Confirm keyboard focus,
deep links, narrow-screen scrolling, selected accents, and reduced-motion mode.
Verify that cash, turns, and heat quick-stat rows remain the same height in
theme previews. No supporter feature may alter action results, odds, rankings,
combat math, or economy output.
