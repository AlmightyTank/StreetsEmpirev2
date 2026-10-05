# StreetsEmpire 1.3: main release post

*Publish this as the season's news post (Admin -> News & banner) when main opens on
`classic-og-v1.3-g`. This is the first main release since 1.0.0, so it covers the 1.1, 1.2 and
1.3 work players have not seen on main yet. The detailed designs are in
[ROADMAP-1.1.0.md](ROADMAP-1.1.0.md), [ROADMAP-1.2.0.md](ROADMAP-1.2.0.md) and
[ROADMAP-1.3.0.md](ROADMAP-1.3.0.md). Balance and audit notes are in
[BUSINESS-SIMULATION-1.1.0-D.md](BUSINESS-SIMULATION-1.1.0-D.md),
[CASINO-AUDIT-1.2.0.md](CASINO-AUDIT-1.2.0.md) and [LAW-AUDIT-1.3.0.md](LAW-AUDIT-1.3.0.md).*

---

**StreetsEmpire 1.3 is ready for main.**

This is the first main release since 1.0, so it is bigger than a normal season patch. The old core is
still here: turns, street work, product, stores, raids, runs, turf, hideouts, alliances, jobs and
season resets. What changed is the middle and late game. Blocks can become real businesses, casino
cities have actual tables, and the law now remembers what you do.

## Businesses, fronts and rackets

City Blocks are no longer only corners to hold. Every block has fixed business lots tied to its
district, and crews can build, staff, upgrade and collect from them.

- **Build on blocks you control.** Lots are empty at the start of the season. A built block is worth
  taking because the businesses stay with the block.
- **Staff matters.** Most businesses use thugs; Strip Clubs use girls. Staff assigned to a business
  is not home working, defending or cooking.
- **Registers fill and cap.** Businesses make money over time, but the register only holds so much.
  You still have to come back and collect.
- **Rackets add choices.** A business can run a front quietly or switch into a racket for stronger
  effects: laundering, VIP rooms, cheaper recon, better market hooks, more run capacity, defense
  help, or extra cash with extra Heat.
- **Block wars replace instant flips on player blocks.** Taking a player's built block is a war with
  warning, fights, siege progress, ally calls, take/sack goals, truce windows and war fatigue.
- **Outpost businesses work away from home.** Away blocks use their outpost box and can become convoy
  targets instead of wiring money home for free.

The business release gate checks that mixed play still beats pure business play, and that rackets do
not turn into infinite passive income.

## Casinos and gambling

Casinos are now real destinations, not just flavor text. The casino never uses real-money purchases,
and no paid feature changes odds.

- **Casino venues in every city.** Las Vegas is the full casino town, but every city has a room with
  its own identity.
- **City chip wallets and floor bankrolls.** Chips stay with their city. To use a cage or table, the
  boss has to be physically there.
- **Slots, Blackjack, Roulette, Street Dice and Poker.** Every game is server-authoritative, saved,
  reconnect-safe and protected against retry double-spends.
- **VIP rooms and high roller status.** Rated play earns status and comps. Status opens higher-limit
  rooms and raises the bankroll ceiling; it never changes odds.
- **Comps buy hotel time only.** They never become cash or chips.
- **Ace's casino Jobs and casino titles.** Casino Jobs pay standing and cosmetics only, never money,
  product, turns or odds.
- **Weekly poker circuit.** Multiplayer Hold'em tables feed a weekly board based on completed table
  results, with no extra prize pool.

The casino audit checked payout math, saved hands, live wagers, poker tables, retry receipts and every
game's long-run return.

## The law

Heat still works the way it did before: it rises fast, cools fast, drags the take and can trigger busts
or arrests. 1.3 adds something slower: every city's police can now build a private **Case** on you.

- **One Case per city.** A Case grows from part of the Heat and evidence you create there: busts,
  arrests, road stops, torching or sacking businesses, hijacks, big cash movements and racket noise.
- **Private by default.** Other players cannot see your Case, add evidence to it or use it as a
  weapon. Staff can inspect it for support and moderation.
- **Receipts for every change.** The Case panel shows why the number moved.
- **Wanted ladder.** Quiet, Noticed, Under Investigation, Warrant, Federal. Stage changes are visible
  to you through the dashboard, Activity, alerts and optional Discord or phone notices.
- **Under Investigation is a warning.** The panel tells you what detectives are looking at before a
  warrant exists.
- **Warrants have a window.** A warrant names a target, your Hideout, a business or you personally,
  and gives you time to respond.
- **Lawyers, officials and informants.** Retain a lawyer, lawyer up against a warrant, put officials
  on city payroll, cut them loose before Internal Affairs lands, or buy information from informants.
- **Federal cases can follow a move.** Local Cases stay in their city. Federal Cases do not.
- **Ledger's law Jobs and clean-record feats.** These pay standing, titles and cosmetics only.

The law balance pass is deliberately conservative. Careful play should rarely see a warrant. Reckless
play should expect one every few days to a week, depending on the city.

## Quality of life since 1.0

- **New player navigation.** Early navigation now focuses on the core loop first: Dashboard, Scout,
  Stores, Produce, Raids and Jobs. Advanced systems stay available, but tucked away until the player
  finishes the getting-started guide.
- **Page help and rules coverage.** Businesses, casinos and the law all have player-facing rules and
  page guidance.
- **Admin tools.** Staff have read-only Casino and Law operation views, Case receipt integrity checks,
  audited Case corrections, and better release-gate coverage.
- **More profile cosmetics and season feats.** Businesses, casinos and law add titles, frames, accents
  and feat categories.
- **Phone and accessibility passes.** The major new pages and admin surfaces were checked at phone
  widths and desktop.

## What did not change

- The existing 1.0 core loop still matters most.
- Gambling is not meant to be the best way to earn money.
- Businesses are not passive income without staff, supply and collection.
- The law does not replace Heat, busts, arrests or bribes.
- No player can add evidence to another player's Case.
- No Job, title, feat, frame or paid feature changes odds, combat math or Case math.
- Older pinned rounds keep their old rules.

This release is a lot, so start with the street loop and grow into the new systems. Build a block if
you want territory to matter. Walk into a casino if you want to risk your own cash. Watch the Case
panel if you keep a city hot.

See you on the streets.
