import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { GameStatusDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { roundsApi } from '../api/rounds.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDate, formatDuration } from '../utils/time.js';

function statusCopy(status: string) {
  if (status === 'ACTIVE') return {
    title: 'The streets are open',
    body: 'Players can join, earn turns, build their crew, scout marks and make raid moves until the round clock expires.',
    action: 'Spend turns before they sit at the cap. Scout first when you need private raid intel.',
  };
  if (status === 'REGISTRATION') return {
    title: 'Registration is open',
    body: 'Players can claim a name and enter before the action starts.',
    action: 'Join now so your account is ready when the round opens.',
  };
  if (status === 'SCHEDULED') return {
    title: 'Round is scheduled',
    body: 'The game is announced, but players cannot enter yet.',
    action: 'Check the start time and come back when registration opens.',
  };
  return {
    title: 'Round is closed',
    body: 'This round is no longer accepting play.',
    action: 'Wait for the next public round to open.',
  };
}

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
  const copy = round ? statusCopy(round.status) : null;
  const localDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

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
            {copy ? (
              <Panel title="What this means">
                <p>{copy.body}</p>
                <p className="se-hint">{copy.action}</p>
                <div className="se-cta se-mt">
                  <Link className="se-btn se-btn--primary" to="/game/combat">Raid page</Link>
                  <Link className="se-btn" to="/game/news">Latest changes</Link>
                </div>
              </Panel>
            ) : null}

            <Panel title="Schedule" flush>
              <div className="se-rows">
                <Row label="Started" value={formatDate(round.startsAt)} />
                <Row label="Ends" value={formatDate(round.endsAt)} />
                <Row label="Phase" value={copy?.title ?? round.status} strong />
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

            {localDev ? (
              <Panel title="Local dev bots">
                <p>Use local bots when you need test targets for cash raids, drive-bys, drug runs, ride theft and lures.</p>
                <div className="se-rows">
                  <Row label="Check bots" value="npm run db:dev-bots:status" />
                  <Row label="Add bots" value="npm run db:seed:dev-bots" />
                  <Row label="Remove bots" value="npm run db:cleanup:seed-rivals" />
                </div>
                <p className="se-hint">The seed refuses to add bots to production or a non-local database unless you set the explicit override.</p>
              </Panel>
            ) : null}
          </div>
        </>
      ) : status ? <Alert>No active game is running.</Alert> : null}
    </GameLayout>
  );
}
