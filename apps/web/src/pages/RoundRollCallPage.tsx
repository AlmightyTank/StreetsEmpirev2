import { CareerNavigation } from '../components/CareerExperience.js';
import { RoundRollCallPanel } from '../components/RoundRollCall.js';
import { GameLayout } from '../layouts/GameLayout.js';

/** Round Roll Call: the round's attendance stamps and their reward calendar. */
export function RoundRollCallPage() {
  return (
    <GameLayout>
      <main className="se-rollcall-page">
        <CareerNavigation active="roll-call" />
        <RoundRollCallPanel />
      </main>
    </GameLayout>
  );
}
