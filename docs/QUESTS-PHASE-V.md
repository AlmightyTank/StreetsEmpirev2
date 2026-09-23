# Quest System — Phase V UI Polish

Phase V is the player-facing consolidation pass for the expanded Jobs system.

Phases O through U added Daily, Weekly, Secret, Branching, City, Alliance and Community/Event jobs. Phase V does not add another quest type or rebalance those systems. It makes the existing surfaces easier to scan, operate and revisit on desktop and mobile.

## Version boundary

Phase V is UI-only.

- The active quest catalog remains `classic-og-v0.7-t`.
- No Prisma migration is required.
- No quest definition, reward, objective target, favor effect or active-job limit changes.
- Older pinned rulesets continue to render through the same DTO contract.

## At-a-glance job desk

The top of the Quests page now exposes the three pieces of state players most often need before reading the full board:

- **Ready to collect** — completed jobs with payment waiting.
- **Tracked** — active jobs pinned by the player, including the normal tracked limit.
- **Personal active** — personal jobs consuming the eight-job active limit.

Each summary is interactive and opens the matching filtered view.

Alliance contracts and Community Events continue to stay outside the personal active-job limit.

## First-class Ready and Tracked views

The tab strip gains:

- **Ready** — only jobs in `READY_TO_TURN_IN`.
- **Tracked** — only tracked active/ready jobs.

The existing Active tab remains the complete active-work view.

Within a view, jobs that need attention are ordered first:

1. Ready to collect
2. Tracked
3. Other active work
4. Available work
5. Historical states

This keeps the important action near the top without changing server ordering or quest state.

## Objective progress

Objective rows now use real progress meters instead of number-only rows.

Each meter keeps the exact authoritative values:

- current amount
- target amount
- currency formatting where appropriate
- completed state
- bonus-objective labeling

Community Events also render the player's personal contribution as a progress meter beside the shared event objective.

The meter is accessible as a native progressbar-style control with current and maximum values.

## Card status hierarchy

Quest cards now separate three concepts that were previously compressed into one metadata string:

- job/contact type
- tracked state
- quest status

Status chips distinguish Available, In progress, Ready to collect, Completed, Failed, Expired and Locked states.

Tracked cards receive a blue edge treatment. Ready cards receive the normal StreetsEmpire accent treatment so a payable job is visible while scanning.

## Time-sensitive jobs

Timed job cards keep the exact local end/reset timestamp and add a compact remaining-time label.

Examples:

- `2d 4h left`
- `3h 18m left`
- `27 min left`

The countdown is based on the existing server-adjusted clock, not the browser wall clock.

Phase U event boundaries, Daily resets, Weekly resets and City-board refreshes remain server-authoritative.

## Navigation and refresh behavior

Selecting a quest tab now writes the tab to the URL query string.

That provides stable links such as:

- `?tab=ready`
- `?tab=tracked`
- `?tab=events`

Refreshing or sharing the page therefore keeps the intended board selected.

The page also refreshes quest state when the browser regains focus or becomes visible again. A manual **Refresh jobs** action remains available in the page header.

This reduces stale Ready, favor and rotating-contract state for players who leave StreetsEmpire open in a browser tab.

## Mobile polish

At phone widths:

- status-at-a-glance cards stack cleanly
- header actions share the available width
- card status chips wrap without truncating the quest title
- progress labels and values stack rather than squeezing
- the existing two-column quest tab grid remains touch-friendly

The controls continue to use the site's standard button and panel styling.

## Compatibility

Phase V preserves all Phase U behavior:

- handcrafted Story and Side Jobs
- Daily and Weekly contracts
- Secret Jobs
- Branching Jobs
- Dynamic City contracts
- Alliance contracts
- Community / Seasonal Events
- favors and favor timers
- permanent unlocks
- tracked-job limits
- personal active-job limits
- server-authoritative quest progress and claims

## Release checks

Phase V is done when:

- Ready jobs are discoverable without scanning every active card.
- Tracked jobs have their own stable view.
- Objective completion can be understood at a glance.
- status, type and tracked state do not blur together.
- timed work shows both exact expiry and remaining time.
- tab selection survives reload/share through the URL.
- returning to an open browser tab refreshes quest state.
- common phone widths do not compress progress/status content into unreadable rows.
- no quest, reward or economy behavior changes as a side effect of the UI pass.
