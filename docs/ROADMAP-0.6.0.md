# 0.6.0 roadmap - Turf

Status: **in progress.** 0.6.0-A is built. 0.6.0-B Holding is implemented on its own
pinned ruleset: Scout presence, local claims, posting/reinforcing/pulling home corners,
real gun custody, lazy upkeep and walkouts, hold bonus, capped house-minted street tax,
linked-account guard, receipts and dashboard. 0.6.0-C Turf Wars is implemented on its
own pinned ruleset: delayed pushes, Lookouts warnings, defender and same-city alliance
backup, chance-to-show reinforcement, offline landing, combat/wounds, block transfer,
hold shields, attacker cooldowns, revenge, delayed locals reclaim, real squad+gun custody,
cap reservations, battle reports, Street Wire/Discord hand-change lines and the C balance
gate are built. The seeded gate lands at 38.7% attacker wins without backup and 23.2% with
an alliance call. 0.6.0-D Outposts is next. Decisions marked *(proposed)* remain open until
the 0.5.0 public round reports in.

0.4.0 gave the crew product to manage, and 0.5.0 gave it roads to move that product on.
Neither gave a crew anything to **hold**. Working a district never touches another player,
and a crew's only claim on a city is that it lives there. 0.6.0 makes the street itself
worth fighting over:
- **Blocks.** Each of the five districts in each of the eight cities is a block, 40 in all.
  A block is held by whoever has a corner crew standing on it.
- **Holding pays.** The holder works its own block for more, gets a street tax on every
  other crew that works it, and learns the block.
- **Taking a block is a fight.** You push the corner crew off, and its owner and their
  allies can ride out to stop you.
- **Crews reach other cities.** An outpost is a corner crew on a block away from home,
  supplied and emptied by runs.

0.6.0 follows the 0.4.0 and 0.5.0 pattern: lettered stages, each with a gate, each shipping
in its own pinned ruleset (`classic-og-v0.6-a`, `-b`, ...) so older rounds keep their rules.

## Before 0.6.0

- **0.5.0-F ships, and one public Travel round is played.** Turf sits on how crews actually
  spread across the eight cities. The A simulation needs real numbers: how many crews live
  where, how many move, and how many runs pass through each town.
- **Decisions still held for real data** (alliance size, reinforcement, special-raid rewards;
  see [ROADMAP-0.3.0.md](ROADMAP-0.3.0.md)) are read from that round's alliance balance report
  before C.

## Where 0.5.0 leaves us

- **Districts are rules, not places.**
  - `CASINO`, `NIGHTCLUB`, `LOW_RENT`, `URBAN_GHETTO` and `WINO_SLUMS` each have pay, recruit
    rates and thug cover, with per-city pay tweaks from 0.5.0-D.
  - Each block's client capacity is hidden and rotates between districts on a seeded clock.
  - A Scout trip works one district in your home city. Nobody else is affected.
- **Combat is between homes.**
  - Raids, drive-bys and special forms are same-city, home against home, with a 1.1 defender
    edge and ±10% rolls.
  - Convoys are the one exception: an ambush roll (no edge, ±30%), a warning window,
    backup from home, and allies who answer a call.
- **Reinforcement has been held since 0.3.0-D.** The simulation
  ([COMBAT-0.3.0-D.md](COMBAT-0.3.0-D.md)) showed that any flat help makes a home nearly
  unraidable. The option that kept swing was bigger help that only sometimes shows up.
- **Alliances have nothing to hold.** Up to five members, shared revenge, recon and a wire,
  but no shared objective, and rankings count only net worth.
- **One city per crew.** `RoundPlayer.cityId` is the only place a crew is. The 0.5.0 roadmap
  pushed "turf in several cities" here.
- **Runs only serve home.** One run at a time. It leaves home, trades and comes back, and
  there is nowhere else to deliver to or collect from.
- **Busy thugs exist.** `RoundPlayer.busyThugs` (0.5.0-E) already holds thugs that are the
  player's and in net worth, but out of work, defense and cooking. Corner crews are the same
  kind of thing, held for longer.

## Decisions

- **A block is one district in one city (proposed).**
  - That gives 40 blocks, each with the district's rules and the city's tweaks.
  - "Turf" means the blocks a crew holds.
- **Holding means standing there (proposed).** A block is held by the crew whose **corner
  crew** is posted on it.
  - A corner crew is fit, armed thugs taken out of home, like escorts on a run. They count
    toward net worth. They do not work, defend home, cover the street or cook.
  - This is the price of turf: every thug on a corner is one less at home when a raid comes.
  - A corner crew needs beer and burns product under a new **CORNER** supply job (0.4.0-B).
    A corner crew that goes short starts to walk.
- **You have to know a block to claim it (proposed).** Posting a corner crew needs
  **presence**: turns worked on that block recently. Presence decays. You cannot claim a
  block you have never worked, so turf grows out of the street economy rather than beside
  it.
- **Blocks start with the locals (proposed).** Every block opens the round held by a local
  crew. Its strength is set per city and district in the ruleset: Detroit's locals are the
  toughest, and Atlanta's are loose.
  - There is always something to take, even in a city with one player in it. This is the
    answer to player density.
  - A block its holder abandons or loses without a new holder goes back to the locals, and
    they grow back over time.
- **What holding pays (proposed).**
  - **Home turf:** the holder's own trips on the block pay more.
  - **Street tax:** a share of what every other crew takes working the block.
  - **Knowing the block:** the holder sees its client capacity in the current rotation, the
    only way to see that number.
  - **The corner sees who passes (E):** holding a block in a town shows runs passing through
    it without spending turns on recon.
- **The tax is minted, not transferred (proposed).** This is the multi-account guard.
  - The worker loses a share of the take. That share is burned.
  - The holder is paid a share from the house.
  - The holder's tax is capped per payer per day, and linked accounts pay each other nothing.
  - Money never moves from one player to another, so an alt working your block feeds you no
    more than the cap.
- **Taking a block is a push (proposed).** It works like a convoy tail:
  - You commit a squad, and the push lands when a warning window closes.
  - The holder sees it coming only through Lookouts. If they are on, they can send more thugs
    from home and call allies in that city.
  - It uses the raid engine with the corner crew, and any backup, as defenders.
  - A win takes the block, and the squad that won becomes its corner crew. A loss sends the
    squad home wounded. The locals fight a push too, with no backup.
- **Reinforcement ships on turf first (proposed).**
  - Allies' help in a push uses the 0.3.0-D "chance to show up" shape: large, uncertain help,
    which keeps swing.
  - Raids on homes stay unreinforced in 0.6.0, so no crew becomes unraidable because it is
    in an alliance.
- **Swing on purpose.** The rotating client clock already makes some blocks rich and some dry
  in turn. Taking a block should be a big high and losing one a real low. Tax and hold
  bonuses widen outcomes rather than raise the average.
- **Net worth still wins the round.** Turf pays into net worth through the tax and the hold
  bonus. Territory gets its own board and Hall of Fame badge, but the podium stays on net
  worth.
- **Turf settles lazily**, like runs and moves: tax, upkeep, walkouts and the locals growing
  back are worked out from timestamps when read. Pushes land in the same due sweep that
  lands convoy tails.

## Stages and gates

| Stage | Deliverable | Gate |
| --- | --- | --- |
| **0.6.0-A - Blocks** | `turf` in the ruleset (per-block tax, hold bonus, presence, corner crew minimums, locals' strength, caps, shields); a `Turf` row per round and block, held by the locals; the city map shows every block and who holds it; turf simulation. | A 0.6.0-A round plays exactly like 0.5.0-E. The simulation shows every block is worth holding for some crew, and none pays more than the thugs it costs at home. |
| **0.6.0-B - Holding** | Presence from Scout trips; posting, reinforcing and pulling a corner crew at home; claiming a block from the locals; hold bonus and street tax; CORNER supply job and walkouts; receipts show tax paid and earned. | Thugs, guns and cash are conserved; posted thugs never defend, work or cook; tax stays within its caps and is zero between linked accounts; a block cannot be held above the per-crew cap. |
| **0.6.0-C - Turf wars** | Pushes with a warning window; backup from home and allies with the chance to show up; hold shields and attacker cooldowns; locals taking back abandoned blocks; battle reports and Discord feed lines for blocks changing hands. | Push win rate is in band with and without backup; a push always settles when its window closes, whoever is online; a block cannot change hands twice inside its shield; raid, drive-by and convoy gates still pass unchanged. |
| **0.6.0-D - Outposts** | Corner crews on blocks away from home, delivered by a run; the outpost's box (beer, product, tax cash) filled and emptied only by runs; a Garage hideout room for a second run; relocation keeps or drops turf. | Everything a run drops or collects is conserved; an outpost box never goes negative; a collecting run can be hit like any other; outpost count is capped. |
| **0.6.0-E - Territory** | Alliance territory on the map; city control and what it gives; the corner sees runs passing through; a Territory board and badge. | No alliance can hold more than its share of a city; alliance territory never adds strength to a home raid; the corner's convoy sighting is no better than paid recon. |
| **0.6.0-F - Release** | Balance across 40 blocks; full-round simulation with holder, raider, runner and mixed crews; a seeded end-of-season crackdown; UI and phone pass; Rules page Turf panel; release regression. | Mixed play beats pure holding, pure raiding and pure running; the 0.4.0-E and 0.5.0-F release gates still pass. |

## 0.6.0-A - Blocks

- **Ruleset:** a `turf` block. It holds:
  - per district: the hold bonus, the tax share burned from the worker, the tax share paid to
    the holder, the corner crew minimum, and the holder's crew share posted on that corner;
  - per city and district: the locals' strength and how fast they grow back;
  - presence: turns needed to claim, and how fast presence decays;
  - caps: blocks per crew at home and away, per-payer daily tax, and blocks per alliance in
    one city;
  - shields and cooldowns for C, and push timings reusing the convoy shape.
- **Schema:**
  - `Turf (roundId, cityId, district, holderRoundPlayerId?, cornerThugs, heldSince,
    shieldUntil, localsStrength, localsAt)`, with one row per block, created with the round.
    A null holder means the locals hold it.
  - `TurfPresence (roundPlayerId, cityId, district, turns, at)`.
  - `RoundPlayer.postedThugs`, separate from `busyThugs` because it has no settle deadline.
- **City map:** the Travel page's city view shows each city's five blocks and who holds them
  (the locals everywhere in A), plus the locals' strength in words ("Detroit's Urban Ghetto:
  the toughest corner in the game").
Built in A: the `classic-og-v0.6-a` ruleset (0.5.0-F balance plus a `turf` block), the
engine's turf calculations (`turfBlocks`, `localsThugs`, `turfTax`, `turfHoldBonus`,
`presenceAfter`, `canClaim`, `cornerUpkeep`) with `turfRulesetProblems`,
`runTurfSimulation` with its gate behind `npm run qa:turf`, the `Turf`/`TurfPresence`
schema, lazy block seeding, and the city map readout. See
[TURF-SIMULATION-0.6.0-A.md](TURF-SIMULATION-0.6.0-A.md).

What the simulation settled:
- **Turf supplements the street.** The best block pays a mid-round crew about a quarter of
  a street day; the slums a fiftieth.
- **Corners scale with the holder.** The Casino takes 10% of the holder's crew and the
  slums take 5%, so filling the home cap costs a mid-round crew roughly 22-36% of its
  thugs instead of being free for late crews.
- **The locals are a ladder**: a fresh crew can take nothing, a mid-round crew can take
  anything, and Detroit's Casino (42 thugs) is the hardest corner in the game against
  Seattle's (21).

- **Simulation (`qa:turf`):**
  - for each block: the hold bonus plus the expected tax against what the corner crew would
    earn and defend at home, across early, middle and late crews, and with 1, 5 and 20 crews
    in the city;
  - the locals' strength against a crew at each stage: when is a claim possible;
  - flag any block no crew should hold, any block that beats the street at its best, and any
    city where one crew could hold every block.

## 0.6.0-B - Holding

- **Presence:** every Scout turn on a block adds presence there. Produce trips add none,
  because the girls work somewhere they are not seen.
- **Claiming from the locals:** needs presence and a squad that beats the locals' corner. In
  B this is a single roll with no window, since only the locals defend.
- **Posting and pulling:** move fit, armed thugs between home and a held block for turns.
  Pulling the whole crew releases the block to the locals.
- **The corner's upkeep:** beer and product under the CORNER supply job, taken from home
  stock at home. A corner that goes short loses happiness, then thugs, the same way a crew
  at home does.
- **Tax and bonus:**
  - a Scout receipt on someone else's block shows the tax taken;
  - the holder's dashboard shows tax earned today against the cap;
  - the holder's own trips show the hold bonus.
- **Guards:** linked accounts pay no tax, and a player cannot claim a block while locked up,
  moving, or with a run out that took the thugs it would need.

## 0.6.0-C - Turf wars

- **The push:**
  - It starts from the block's city: you must live there (outposts join in D).
  - The squad is committed on start, like a convoy tail.
  - It lands when the window closes. If the holder has pulled the corner by then, the block
    falls to the attacker unopposed.
  - One push on a block at a time.
- **The holder's side:**
  - they see the push through Lookouts, on the same clock as convoy tails;
  - they can send backup from home;
  - they can call allies who live in that city, and each ally's help shows up with a chance
    set in the ruleset.
- **The fight:** the raid engine with the corner crew as defenders, a small corner edge
  (below the home 1.1), and a roll wider than a raid's. Set in the C simulation.
- **After it:**
  - a won block gets a hold shield;
  - the loser's surviving corner crew goes home wounded;
  - the attacker has a cooldown on that block;
  - nothing is looted but the block itself. The fight is for the tax.
- **Revenge:** losing a block opens revenge against the taker, as a raid does.
- **The wire:** the street wire and the Discord city feed carry blocks changing hands
  ("Low Rent in Detroit fell to [TAG] Slick").

Built in C: the full delayed fight lifecycle above, plus battle reports, shared retaliation
against the taker (presence waiver only; the hold shield still stands), a six-hour vacant
window before locals reclaim an abandoned corner, and public Street Wire/Discord
hand-change lines. The C simulation is recorded in
[TURF-SIMULATION-0.6.0-C.md](TURF-SIMULATION-0.6.0-C.md): equal 20-thug crews produce
38.7% attacker wins without backup and 23.2% with an alliance call; 48.7% of help showed
against the configured 50%.

## 0.6.0-D - Outposts

Status: **complete.** Away turf now has its full playable loop: runs can establish and
service outposts; upkeep and street tax stay in the remote box; player pushes can capture
an outpost and steal a capped exposed share; the one-level Garage raises the active-run
limit to two with independent routing, trading, convoy reach and aggregate away net worth;
and relocation previews then converts destination outposts into home turf, old-home blocks
into outposts up to the away cap, and releases any overflow when the move arrives.

- **An outpost is a corner crew away from home.** It is how a crew holds turf in more than
  one city without leaving home.
- **Delivered by a run:** a run stopping in a town can drop thugs, guns, beer, product and
  cash into an outpost there. It still needs the normal turf-presence requirement earned
  by Scout work; merely driving a run through town does not create presence.
- **The box:** each outpost has its own stock. Upkeep burns from it, and tax earned there
  lands in it.
  - Nothing is wired home. Collecting tax means sending a run.
  - That gives runs a second job, and convoys a richer target on the way back.
- **Raiding an outpost** is a push against its block. Losing it loses a share of the box,
  capped.
- **A Garage** (hideout room) raises the run limit to two. It answers 0.5.0's open question
  on more than one run at a time.
- **Relocation:**
  - moving to a city where you hold an outpost makes it home turf;
  - blocks in the city you leave become outposts if you are under the away cap, or go back to
    the locals.
  - The move screen shows which.

## 0.6.0-E - Territory

- **Alliance territory:** the blocks every member holds, shown on the city map in the
  alliance's tag.
- **City control:** an alliance holding a set share of a city's blocks controls it.
  Members pay no tax there, and the city shows as theirs on the Travel map and the Discord
  feed. The cap on blocks per alliance in a city stops one alliance from holding all five.
- **The corner sees who passes:** a crew holding a block in a town sees runs passing
  through it, as a recon would, without spending turns. It sees less than paid recon: no
  bands for the wallet and trunk. This makes chokepoints (Detroit, Atlanta, LA) worth
  holding.
- **Territory board:** blocks held over time, per crew and per alliance, next to the
  net-worth rankings. A Hall of Fame badge for the crew and the alliance that held the most.

## 0.6.0-F - Release

- **Balance:** a pass over all 40 blocks on `qa:turf` and full-round runs, including
  outposts, the Garage and the tax caps.
- **Full-round simulation:** holder, raider, runner, mover and mixed crews, solo and in
  alliances, across the eight cities.
- **The crackdown:** one seeded event near the end of the round. The Feds sweep one city:
  its holders' corner crews take Heat and some are picked up. It is announced on the wire a
  day ahead, so crews decide whether to hold or pull out.
- **UI:** a phone pass on the city map, the push screen and outposts; the Rules page gains a
  Turf panel.
- **Release regression:** turf integration suites join `qa:release`.

## Open questions

1. **Minted or transferred tax.** Minting is proposed as the multi-account guard, but it adds
   money to the round. Is burn plus a capped mint the right shape, or should the holder's
   share simply be smaller than the worker's loss?
2. **Caps.** Blocks per crew at home and away, and per alliance in a city. Two at home, one
   away, and three of five per alliance are starting points for the A simulation.
3. **Does holding draw Heat?** Tax is dirty money. A little Heat per dollar would tie turf
   to the city's police lines, and to the crackdown.
4. **Presence for outposts.** Can a run's crew build presence in a town, or must you have
   lived there?
5. **Reinforcement beyond turf.** If the chance-to-show-up shape plays well on turf, does it
   come to home raids in a later version?
6. **Locals' growth.** How fast locals take back abandoned blocks decides whether a quiet
   city stays with its first claimer or keeps churning.

## Not in 0.6.0

- **Cross-city raids on homes.** Outposts and convoys are the only fights away from home.
- **Player-to-player trade and transfers,** including between allies and through outposts. A
  run can only fill and empty its owner's own outposts.
- **Open DMs.**
- **Individual worker records** and **pills**, still.
