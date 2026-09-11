import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { classicOgV01, rulesets } from '@streets/rulesets';
import { formatCents, formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';
import { formatDuration } from '../utils/time.js';

/**
 * Everything a new player is handed, read straight from the active ruleset so
 * this page can never drift from what the server actually grants.
 */
function rulesetFor(roundRulesetId: string) {
  return rulesets[roundRulesetId] ?? classicOgV01;
}

export function JoinPage() {
  const { round, me, canJoin, join } = useSession();
  const navigate = useNavigate();

  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to="/game" replace />;

  async function onJoin() {
    setBusy(true);
    setMessage(null);
    try {
      await join();
      navigate('/game');
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : 'Something went wrong. Try that again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!round) {
    return (
      <Shell narrow>
        <Panel title="No game running">
          <p className="se-dim">
            There is no round open right now. Check back soon.
          </p>
        </Panel>
      </Shell>
    );
  }

  const ruleset = rulesetFor(round.rulesetId);
  const start = ruleset.round.startingPlayer;

  return (
    <Shell>
      <p className="se-eyebrow">Enter the round</p>
      <h1 className="se-display se-hero se-hero--sm">{round.name}</h1>
      <p className="se-lede">
        You start in New York City with a name, a little cash and 200 turns.
        What you do with them is on you. Strategy raid rounds start with a crew ready to fight.
      </p>

      {message ? <Alert>{message}</Alert> : null}

      <div className="se-grid se-grid--sidebar">
        <Panel title="What you start with" flush>
          <div className="se-rows">
            <Row label="Cash" value={formatCents(start.cashCents)} strong />
            <Row label="Turns" value={`${start.turns} / ${ruleset.turns.cap}`} strong />
            <Row label="Whores" value={formatNumber(start.whores)} />
            <Row label="Thugs" value={formatNumber(start.thugs)} />
            <Row label="Condoms" value={formatNumber(start.condoms)} />
            <Row label="Crack" value={formatNumber(start.crack)} />
            <Row label="Beer" value={formatNumber(start.beer)} />
            <Row label="Medicine" value={formatNumber(start.medicine)} />
            <Row label="Pistols" value={formatNumber(start.pistols)} />
            <Row label="Shotguns" value={formatNumber(start.shotguns)} />
            <Row label="Tek-9s" value={formatNumber(start.tek9s)} />
            <Row label="AK-47s" value={formatNumber(start.ak47s)} />
            <Row label="Low-Riders" value={formatNumber(start.lowRiders)} />
            <Row label="Payout" value={`${start.payoutPercent}%`} />
            <Row label="City" value={ruleset.round.startingCitySlug === 'new-york-city' ? 'New York City' : ruleset.round.startingCitySlug} />
          </div>
        </Panel>

        <aside>
          <Panel title="Round" flush>
            <div className="se-rows">
              <Row label="Status" value={round.status} />
              <Row label="Time remaining" value={formatDuration(round.msRemaining)} strong />
              <Row label="Players" value={round.playerCount} />
              <Row
                label="Turns"
                value={`+${ruleset.turns.amountPerInterval} every ${ruleset.turns.intervalMinutes} min`}
              />
              <Row label="Ruleset" value={round.rulesetId} />
            </div>
          </Panel>

          <div className="se-mt">
            <button
              type="button"
              className="se-btn se-btn--primary se-btn--block"
              onClick={onJoin}
              disabled={busy || !canJoin}
            >
              {busy ? 'Entering...' : `Enter ${round.name}`}
            </button>
            {!canJoin ? (
              <p className="se-hint">
                This round is not taking new players right now.
              </p>
            ) : (
              <p className="se-hint">
                One player per account per round. You keep your account when the
                round ends.
              </p>
            )}
          </div>
        </aside>
      </div>
    </Shell>
  );
}
