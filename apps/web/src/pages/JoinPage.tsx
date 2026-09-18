import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { classicOgV01, rulesets } from '@streets/rulesets';
import { formatCents, formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
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
  const { round, me, canJoin, join, roundOver } = useSession();
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
        You start in New York City with cash, turns, guns and a crew ready to fight.
        Build income first, scout before risky hits, then climb the public board before the round clock runs out.
      </p>

      {message ? <Alert>{message}</Alert> : null}

      {roundOver ? (
        <Panel title="Fresh season handoff">
          <div className="se-season-callouts">
            <div className="se-season-callout se-season-callout--saved">
              <strong>{roundOver.round.name} is saved</strong>
              <span>
                Your final {roundOver.player.rank.national === null ? 'national finish' : `#${formatNumber(roundOver.player.rank.national)} national finish`}
                {` and ${formatCents(roundOver.player.netWorthCents)} net worth`} are now part of your legacy.
              </span>
            </div>
            <div className="se-season-callout">
              <strong>{round.name} starts clean</strong>
              <span>No cash, crew, weapons, supplies, intel or cooldowns carry into this round. Everyone rebuilds from the same start.</span>
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="se-grid se-grid--sidebar">
        <Panel title="What you start with" flush>
          <div className="se-rows">
            <Row label="Cash" value={formatCents(start.cashCents)} strong />
            <Row label="Turns" value={`${start.turns} / ${ruleset.turns.cap}`} strong />
            <Row label="Whores" value={formatNumber(start.whores)} />
            <Row label="Thugs" value={formatNumber(start.thugs)} />
            <Row label="Condoms" value={formatNumber(start.condoms)} />
            <Row label={'products' in ruleset && ruleset.products ? 'Crack' : 'Product'} value={formatNumber(start.crack)} />
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

        <Panel title="First moves">
          <ol className="se-list">
            <li>Scout a district to bring in cash, whores and thugs.</li>
            <li>Buy condoms, beer and weapons before happiness starts dragging you down.</li>
            <li>Produce product when your shelves get thin or you want stash for drug and lure runs.</li>
            <li>Scout a rival on the raid page before you risk a serious hit.</li>
          </ol>
          <p className="se-hint">Rankings show public money and legacy. Recon is where you learn private raid info like wounds, weapons, product and exposed cash.</p>
        </Panel>

        <aside>
          <Panel title="Round" flush>
            <div className="se-rows">
              <Row label="Status" value={round.status} />
              <Row label="Time remaining" value={formatDuration(round.msRemaining)} strong />
              <Row label="Players" value={round.playerCount} />
              <Row label="Window" value={`${formatDuration(round.msRemaining)} to build, raid and rank`} />
              <Row
                label="Turns"
                value={`+${ruleset.turns.amountPerInterval} every ${ruleset.turns.intervalMinutes} min`}
              />
              <Row label="Ruleset" value={round.rulesetId} />
            </div>
          </Panel>

          <div className="se-mt">
            <Button
              type="button"
              className="se-btn se-btn--primary se-btn--block"
              onClick={onJoin}
              disabledReason={busy
                ? 'Putting you on the streets now.'
                : !canJoin
                  ? `${round.name} is ${round.status.toLowerCase()} and is not taking new players.`
                  : null}
            >
              {busy ? 'Entering...' : `Enter ${round.name}`}
            </Button>
            {!canJoin ? (
              <p className="se-hint">
                This round is not taking new players right now.
              </p>
            ) : (
              <p className="se-hint">
                One player per account per round. You keep your account, legacy badges and cosmetics when the round ends.
              </p>
            )}
            <p className="se-hint">
              Want the latest patch notes first? Read the <Link to="/game/news">development wire</Link> after you join.
            </p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
