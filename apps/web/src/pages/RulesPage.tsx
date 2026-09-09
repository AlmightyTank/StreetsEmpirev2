import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { GameStatusDto } from '@streets/shared';
import { roundsApi } from '../api/rounds.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

export function RulesPage() {
  const me = useSession((s) => s.me);
  const [status, setStatus] = useState<GameStatusDto | null>(null);

  useEffect(() => {
    roundsApi.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Rules</h1>
          <p className="se-eyebrow">{status?.ruleset?.name ?? 'Classic OG'} · the short version</p>
        </div>
      </div>

      <div className="se-grid se-grid--2">
        <Panel title="Turns">
          <ul className="se-list">
            <li>Actions spend turns; shopping and changing payout do not.</li>
            <li>{status?.turns ? `You regenerate ${status.turns.amountPerInterval} turns every ${status.turns.intervalMinutes} minutes, up to ${status.turns.cap}.` : 'Turns regenerate on the round clock up to the cap.'}</li>
            <li>Leaving the game alone can grant the configured away bonus; leaving a tab open does not fake activity.</li>
          </ul>
        </Panel>

        <Panel title="Money & Rank">
          <ul className="se-list">
            <li>Net worth—not cash alone—decides local and national rank.</li>
            <li>Tied net worth shares a rank. The next rank skips the tied positions.</li>
            <li>Your daily movement compares your current rank with the first snapshot after the daily reset.</li>
          </ul>
        </Panel>

        <Panel title="Crew">
          <ul className="se-list">
            <li>Scout to make money and pick people up. Cook to keep them.</li>
            <li>Recruitment slows as your empire grows, so early growth is faster than late growth.</li>
            <li>The cut you pay, supplies on the shelf and thugs on watch set happiness. Very unhappy crew can walk.</li>
          </ul>
        </Panel>

        <Panel title="Stores & Guns">
          <ul className="se-list">
            <li>Store orders are all-or-nothing. You never get a silent partial order.</li>
            <li>Tek-9 and AK-47 purchases require street-work reputation and Tommy’s one-time favors.</li>
            <li>Unlocks last for the round even if your cash or crew later falls below the requirement.</li>
          </ul>
        </Panel>
      </div>
    </GameLayout>
  );
}
