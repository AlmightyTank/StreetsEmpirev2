import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { GameStatusDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { roundsApi } from '../api/rounds.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDate, formatDuration } from '../utils/time.js';

export function StatusPage() {
  const me = useSession((s) => s.me);
  const [status, setStatus] = useState<GameStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    roundsApi.status()
      .then(setStatus)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load game status.'));
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  const round = status?.round;
  const turns = status?.turns;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Game Status</h1>
          <p className="se-eyebrow">Round clock and ruleset</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {!status ? <p className="se-muted">Checking the round...</p> : null}

      {round ? (
        <>
          <div className="se-stats se-mb">
            <Stat label="Round" value={round.name} />
            <Stat label="Status" value={round.status} />
            <Stat label="Players" value={formatNumber(round.playerCount)} />
            <Stat label="Time Left" value={formatDuration(round.msRemaining)} />
          </div>

          <div className="se-grid se-grid--2">
            <Panel title="Schedule" flush>
              <div className="se-rows">
                <Row label="Started" value={formatDate(round.startsAt)} />
                <Row label="Ends" value={formatDate(round.endsAt)} />
                <Row label="Ruleset" value={status.ruleset?.name ?? round.rulesetId} strong />
                <Row label="Version" value={status.ruleset?.version ?? round.rulesetVersion} />
              </div>
            </Panel>

            <Panel title="Turns" flush>
              <div className="se-rows">
                <Row label="Regeneration" value={turns ? `+${turns.amountPerInterval} every ${turns.intervalMinutes}m` : '-'} strong />
                <Row label="Cap" value={turns ? formatNumber(turns.cap) : '-'} />
                <Row label="Away bonus" value={turns?.awayBonus.enabled ? `+${turns.awayBonus.amount} after ${turns.awayBonus.afterHours}h` : 'Disabled'} />
              </div>
            </Panel>
          </div>
        </>
      ) : status ? <Alert>No active game is running.</Alert> : null}
    </GameLayout>
  );
}
