# 0.6.0-A turf simulation: findings

The turf numbers were set before anything was built, as the cities were in 0.5.0-A. Rerun
the tables with `npm run qa:turf` (`-- --output turf.md` writes them to a file).

## What it asks

For each of the three crews the travel simulations already use (fresh, mid-round and late)
and each of the forty blocks:

- **Hold bonus:** what the district's `holdBonus` adds over a day of the holder working its
  own block, at 120 turns a day.
- **Tax:** what three rivals working it 60 turns each mint for the holder, after the daily
  cap per payer.
- **Corner costs:** the girls the posted thugs were covering at home and no longer are,
  plus the beer and product the corner burns standing there for a day.
- **Off the house:** the share of the crew's thugs standing on that corner instead of
  defending it.
- **Street share:** a day of holding against a day of that crew's street work.

It is deliberately generous to turf, the way the 0.5.0-A travel simulation was generous to
runs: nobody pushes the holder off, the corner never goes short, and the rivals turn up
every day. 0.6.0-C cuts into this ceiling.

## The gate

`turfGate` fails on any of:

1. anything `turfRulesetProblems` catches: a district that mints more than the street
   loses, a rich block cheaper to hold than a poor one, a city with no locals, a cap that
   hands one crew or one alliance a whole city, a push that swings wider than an ambush;
2. a block no crew is better off holding, or one the locals hold against every crew in the
   game;
3. a block that pays more than working the street (`streetShare >= 1`);
4. a fresh crew that can take every corner in the game, or a late crew shut out of any;
5. any crew big enough to fill its home cap on under 10% of its thugs, or only by posting
   over 60% of them.

## What it settled

- **Turf supplements the street; it never replaces it.** The best block in the game pays a
  mid-round crew about **a quarter of a street day** (0.26x), and the Wino Slums about a
  fiftieth. That is the intended shape: turf is a second income, and the crew still has to
  work.
- **A corner now scales with the crew holding it.** The district minimum still protects
  small crews, but bigger crews post a share of their muscle: 10% on Casino blocks, down to
  5% in the Wino Slums. Filling the home cap costs a mid-round crew about 22-36% of its
  thugs, and a late crew about 17-33%, instead of 1-3%.
- **Cheap blocks are still cheap in cash terms, but not free in defense terms.** The Casino
  remains the only block with a meaningful cash opportunity cost, paying back about 1.6x
  for a mid-round holder. Slums and low-rent blocks still pay back fast because those thugs
  were spare street cover, but they now leave a visible hole at home.
- **Caps still matter, but they are not alone.** Two blocks at home keeps one crew from
  holding a city; the scaling corner means those two blocks also reserve roughly a fifth to
  a third of the holder's crew. C still has to price neglected turf through pushes and
  short-supplied corners, especially on cheap blocks.
- **The locals are a ladder.** A fresh crew (5 thugs) can take nothing; a mid-round crew
  (50) can take every block; a late crew is shut out of none. The spread between cities
  holds the characters the cities already have: Detroit's Casino is the hardest corner in
  the game at 42 thugs, Seattle's the softest at 21.
- **Living somewhere changes what a block pays.** The city district pay from 0.5.0-D flows
  through: Seattle's and Miami's casinos pay less, so their Casino blocks are worth less to
  hold, and Las Vegas and Beverly Hills pay the most.

## Open from A

1. **Is the tax cap the right shape?** At $50,000 a payer a day, a busy Casino block mints
   about $22,000 a day for a mid-round holder: real money, but nowhere near a street day.
   A quiet block with one rival mints a third of that.
2. **How often do cheap blocks get pushed?** The scaling corner fixed the home-defense hole,
   but slums still have tiny cash opportunity cost. C decides whether frequent pushes and
   corner supply make them expensive enough to keep.
3. **Where does the money come from?** The tax is minted, so turf adds cash to a round.
   The cap bounds it per payer per day, but a full-round simulation in F has to show it
   does not inflate a season.
