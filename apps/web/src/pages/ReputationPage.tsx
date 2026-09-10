import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { ReputationSummaryDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { reputationApi } from '../api/reputation.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

/** Where each trader keeps shop, so a favour is one click from here. */
const SHOP_PATH: Record<string, string> = {
  CORNER: '/game/stores/corner',
  TOMMY: '/game/stores/tommy',
  CHARLIE: '/game/stores/charlie',
  PIP: '/game/stores/pip',
};

function Standing({ points, max, label }: { points: number; max: number; label: string }) {
  const filled = Math.max(0, Math.min(100, Math.round((points / max) * 100)));

  return (
    <div className="se-rep__bar" role="img" aria-label={`${label}: ${points} of ${max}`}>
      <span className="se-rep__fill" style={{ width: `${filled}%` }} />
    </div>
  );
}

/**
 * Where you stand with the city.
 *
 * Read-only on purpose: a favour is done where the trader is, in their shop,
 * the same way Tommy's always was. This is the one place that shows all four
 * at once and what the total has opened.
 */
export function ReputationPage() {
  const me = useSession((s) => s.me);

  const [summary, setSummary] = useState<ReputationSummaryDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    reputationApi
      .summary()
      .then(setSummary)
      .catch(() => setLoadError('Could not read the street right now. Try again in a moment.'));
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">The Street</h1>
          <p className="se-eyebrow">What this city makes of you</p>
        </div>
      </div>

      {loadError ? <Alert>{loadError}</Alert> : null}

      {summary ? (
        <div className="se-grid se-grid--sidebar">
          <Panel
            title="Standing"
            aside={<span className="se-num se-dim">{formatNumber(summary.totalRep)} total</span>}
          >
            {summary.traders.map((trader) => (
              <div key={trader.trader} className="se-mt">
                <div className="se-rows">
                  <Row
                    label={trader.traderName}
                    value={`${trader.standing} · ${formatNumber(trader.points)} / ${formatNumber(trader.max)}`}
                    strong
                  />
                </div>
                <Standing points={trader.points} max={trader.max} label={trader.traderName} />
                <p className="se-hint">
                  {trader.quest.done ? (
                    <>
                      <b className="se-good">{trader.quest.title}</b> done &mdash;{' '}
                      {trader.keeper} restocks for you{' '}
                      <b className="se-num">{trader.restockSpeedup}%</b> sooner.
                    </>
                  ) : (
                    <>
                      {trader.keeper} wants: {trader.quest.title} &mdash;{' '}
                      <b className="se-num se-dim">
                        {formatNumber(trader.quest.have)} / {formatNumber(trader.quest.need)}
                      </b>
                      .{' '}
                      <Link to={SHOP_PATH[trader.trader] ?? '/game'}>
                        Square it at {trader.traderName}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            ))}
          </Panel>

          <aside className="se-grid">
            <Panel title="What it opens" flush>
              <div className="se-rows">
                {summary.unlocks.map((unlock) => (
                  <Row
                    key={unlock.key}
                    label={unlock.weaponName}
                    value={
                      unlock.unlocked
                        ? 'Earned'
                        : `${formatNumber(unlock.totalRep)} / ${formatNumber(unlock.totalRepRequired)}`
                    }
                    strong={unlock.unlocked}
                  />
                ))}
              </div>
            </Panel>

            <p className="se-hint">
              Standing is per trader, but the guns read the total &mdash; Tommy sells
              to you partly because Pip vouches for you. Dealing with a shop earns a
              little once a day, however much you buy. The favours are worth far more,
              and there is no way to the AK-47 without them.
            </p>
          </aside>
        </div>
      ) : null}
    </GameLayout>
  );
}
