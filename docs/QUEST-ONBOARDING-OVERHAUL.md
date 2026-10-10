# Guided Quest Overhaul

## Goal

Rewrite the opening quest progression as a guided campaign through the core StreetsEmpire loop. After the capstone, open ten optional specialties that introduce the rest of the project and point into its existing contact and faction arcs.

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
| 1. Work the Block | Turns, cash, districts, scouting, recruitment and resource changes | Scout a district and review the result |
| 2. Balance the Crew | Crew growth, roles, readiness, health and supplies | Build a working mix of workers and muscle |
| 3. Stock the Shelves | Stores, inventory, storage limits and crew upkeep | Restock the supplies your crew needs |
| 4. Make Your Own Supply | Production, product inventory, product choice and work supply | Produce a batch after taking the job |
| 5. Read the Take | Street income, cash flow and payouts | Earn cash from fresh work |
| 6. Arm the Muscle | Weapons, crew condition and combat readiness | Equip the crew before accepting combat work |
| 7. Look Before Trouble | Recon, target information and raid reports | Recon another player |
| 8. Commit to a Fight | Raid planning, risk and recovery | Resolve one raid attempt; a win is not required to continue |
| 9. Leave Home Loaded | Cities, routes, vehicles, runs and road risk | Launch one intercity run |
| 10. First Empire | Turf and a recap of the core loop; unlocks the specialty board | Claim one city block |

The core line uses the current story lessons. Its combat objective records a resolved raid attempt regardless of outcome, so losing a fight does not strand the player. Advanced systems remain optional specialty starts after the capstone; actions with high cash or risk costs never block the tutorial.

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
- **Supply Broker:** local supply, property, pickups, shipments and international supply lanes
- **Career & Community:** profile, progression, Street Pass, achievements, rankings, career history and community events

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

1. Preserve the existing ten-quest core lesson sequence and revise the combat lesson to accept any resolved raid outcome.
2. Turn the final turf lesson into the capstone and connect it to independent specialty starts.
3. Gate each specialty start behind the capstone, then gate its deeper contact arc behind the matching start.
4. Use the existing quest story, objective, and prerequisite UI rather than adding a parallel tutorial engine.
5. Test event tracking, branch availability, content validation, and older ruleset pinning.

## Acceptance criteria

- A new player can follow one visible, ordered core quest path and can see ten specialty starts after the capstone.
- Every lesson contains one clear explanation and one practical objective tied to a real action or state.
- A lesson unlocks only after its prerequisite is claimed; players can see what opens next.
- Core quests introduce economy, crew, product, combat, travel and turf. Specialty starts cover business, law, supply network, contacts/factions, casino, progression and community features.
- Completing the capstone opens multiple independent branches.
- Existing rotating contracts and deep contact/faction story content remain available in their appropriate paths.
- Old rounds keep their pinned quest definitions and behavior.
- No account-persistent reward creates a permanent gameplay advantage.
