# StreetsEmpire 1.6.5-G release gate

This slice adds a deterministic balance run and wires loan-specific regression coverage into the release candidate check.

## Run the gates

- Balance assumptions and hard-limit simulation: `npm run qa:loans`.
- Full release candidate, including PostgreSQL integration suites: `npm run release:rc`. The loan suites run with `LOAN_INTEGRATION=1` and cover pause behavior, settlement, collections, recovery, reconciliation, retries, and admin corrections.
- Mobile and accessibility audit with a running local API and web client: `npm run qa:release -- --with-ui`.

The simulator prints each offer's fee, payoff, term, and share of earnings during the loan term. Its default reference profile is $60,000 per game day; change it with `npm run qa:loans -- --earnings-cents 3000000`. This is an explicit balance assumption, not production telemetry. Review a new player's Quick Cash choice and an established borrower's higher utilization and missed-payment price before changing pinned offer values.

## Release checks

- Repeated Quick Cash borrowing reaches a serious balance and stops below the shared debt ceiling.
- Late fees stop at the per-loan, round-wide, and debt ceilings.
- Collections stays within the disclosed income share, rolling-day cap, cash, and overdue amount; recovery restores Clear standing.
- 1.6.5-C delinquency remains unchanged and pre-loan 1.6.0-H retains no loan behavior.
- `/api/game/me` reads during a paused round leave scheduled installments, fees, debt, and standing unchanged, matching the due-settlement poller's pause exclusion.
- PostgreSQL reconciliation and the mobile/accessibility audit pass before promotion to beta.
