# Guided Quest Overhaul

## Goal

Rewrite the opening quest progression as a guided campaign through every major StreetsEmpire feature. After players finish the full tour, open the quest board into optional specialization branches.

This replaces the current opening quest sequence as the tutorial. It does not remove rotating contracts, seasonal/event work, or the deeper contact and faction arcs; those become available as side content or branch paths after their systems are introduced.

## Player flow

1. A new round starts with a short, ordered tutorial chapter.
2. Each lesson sends the player to the relevant game screen, explains one mechanic, and asks for a practical action.
3. Claiming the lesson reward unlocks the next lesson and the next system in the tour.
4. Completing the capstone opens the specialization board.
5. Players can then follow any combination of contact and system branches.

Every chapter card should show the current lesson, its objective progress, the game feature it teaches, and what completion opens.

## Guided campaign

| Chapter | Feature coverage | Example lesson action |
| --- | --- | --- |
| 1. Get on Your Feet | Dashboard, resource strip, turns, cash, crew, inventory, activity and payouts | Read the resource strip, complete a short Scout, then set a payout |
| 2. Work the Block | Districts, scouting, recruitment, crew performance and supplies | Scout a district and review the resulting crew and resource changes |
| 3. Keep the Operation Running | Production, product inventory, product choice, work supply and happiness | Produce or restock a product and inspect the effect on the operation |
| 4. Buy and Manage | Stores, inventory and storage limits, weapons, rides, businesses, properties and dealer crews | Complete a safe purchase or management action and review the ledger |
| 5. Protect the Crew | Crew assignments and traits, weapons, health, recon, raids, raid reports and recovery | Inspect combat readiness, recon a target, then complete a protected tutorial combat action |
| 6. Understand the Heat | Heat, busts, arrests, Cases, warrants, lawyers, officials, informants and city pressure | Review a Case or Heat report and learn which actions increase exposure |
| 7. Leave Home | Cities, routes, vehicles, runs, road risk, convoys, supply pickups and shipments | Plan a short run, review route risk, and return or settle the run |
| 8. Claim Ground | Turf, districts/blocks, territory control, block wars, businesses on turf and alliances | Inspect a block, understand control, then complete a low-risk turf objective |
| 9. Build the Network | Jobs, contacts, reputation, favors, factions, standing, branch choices, daily/weekly/city/season/alliance contracts and community events | Claim a contact job and review its follow-up, reward and reputation changes |
| 10. Take a Break and Track Your Career | Casino venues and games, Street Pass, player XP, titles, cosmetics, achievements, profile, rankings, career history and community features | Visit the casino and progress page, then review the career/profile rewards |
| 11. First Empire | Review the player’s operation and summarize the systems they have learned | Complete a capstone that combines a business goal with a chosen operational action |

Feature lessons should use the smallest safe action that genuinely teaches the feature. A lesson about casino play should use a low minimum wager; a lesson about combat, law, turf, or travel should not require a high-risk loss to continue.

## Branches after the tour

The capstone opens these optional paths. Players can pursue several branches; choosing one does not lock the others.

- **Street Operator:** scouting, production, product choices, supply policies and dealer crews
- **Business Builder:** storefronts, businesses, property, upkeep, books and supply management
- **Crew Boss:** recruiting, crew roles/traits, training, weapons, vehicles and recovery
- **Enforcer:** recon, raids, retaliation, turf, block wars and territory control
- **Road Boss:** garage, city travel, runs, convoys, pickups, shipments and international supply lanes
- **Fixer:** Heat, Cases, warrants, lawyers, informants, officials and law contacts
- **Underworld Network:** contact arcs, factions, standing, favors, contracts, alliances and events
- **High Roller:** casino games, rated play, comps, poker and casino status

Use the existing contacts as the voices and givers for the branches: Mama for fundamentals, Pip for product and business, Tommy for weapons and muscle, Wheels for vehicles and travel, Vic for favors and pressure, Blocks for turf, Ace for casino, and Ledger for law.

## Existing quest content

- Rewrite the opening story sequence into the ordered tutorial chapters above.
- Rework existing contact jobs that teach systems so they become the corresponding lessons or branch entries, preserving useful writing, objectives, rewards, and contact reputation where they still fit.
- Keep the existing optional and rotating board content: daily, weekly, city, season, alliance, secret, event, and community jobs remain their own board types.
- Keep contact/faction finales and cosmetic rewards as branch capstones.
- Keep feature unlocks round-scoped where they alter gameplay. Account-wide XP, titles, frames, themes and career records remain progression or cosmetic rewards, not permanent competitive advantages.

## Implementation approach

The current quest system already has the right foundations: ordered prerequisites and follow-ups, event-driven objectives, quest stories with a plain-language lesson/action hint, branch choices, and permanent-in-round unlock rewards. Build the overhaul as quest data and small UI changes in the existing system; avoid creating a parallel tutorial engine.

Implementation should:

1. Inventory current story quest keys, objectives, unlock rewards, and prerequisite chains in the active ruleset.
2. Map each current job to a tutorial lesson, a post-tour branch, or existing board content.
3. Define the chapter order and make only the next tutorial lesson available at each point.
4. Add chapter/feature labels and explicit “opens after” copy to quest cards.
5. Add navigation from a lesson to the page it teaches, including mobile behavior.
6. Add the capstone transition to the specialization board.
7. Test progression across actions, claim/replay behavior, locked-state copy, branch availability, and rounds pinned to older rulesets before updating a ruleset version.

## Acceptance criteria

- A new player can follow one visible, ordered quest path from the first dashboard visit through all major feature groups.
- Every lesson contains one clear explanation and one practical objective tied to a real action or state.
- A lesson unlocks only after its prerequisite is claimed; players can see what opens next.
- The feature tour includes economy, crew, product/business, combat, law, travel, turf, supply network, contacts/factions, casino, progression and community features.
- Completing the capstone opens multiple independent branches.
- Existing rotating contracts and deep contact/faction story content remain available in their appropriate paths.
- Old rounds keep their pinned quest definitions and behavior.
- No account-persistent reward creates a permanent gameplay advantage.
