import { Navigate } from 'react-router-dom';
import type { RoundPlayerDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { ActivityFeed } from '../components/ActivityFeed.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { PayoutControl } from '../components/PayoutControl.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useLiveDashboard } from '../hooks/useLiveDashboard.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

function RankMovement({ movement }: { movement: number | null }) {
  if (movement === null || movement === 0) {
    return <span className="se-muted">no change today</span>;
  }
  return movement > 0 ? (
    <span className="se-good">&#9650; {movement} today</span>
  ) : (
    <span className="se-bad">&#9660; {Math.abs(movement)} today</span>
  );
}

function HappinessRow({ label, value }: { label: string; value: number }) {
  const tone = value >= 66 ? '' : value >= 33 ? ' se-meter__fill--warn' : ' se-meter__fill--bad';

  return (
    <div className="se-happiness">
      <div className="se-happiness__head">
        <span className="se-row__label">{label}</span>
        <span className="se-row__value">{value}%</span>
      </div>
      <div className="se-meter">
        <div className={`se-meter__fill${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** Section 14. Turns, and when the next ones land. */
function TurnsTile({
  turns,
  onTick,
}: {
  turns: RoundPlayerDto['turns'];
  onTick: () => void;
}) {
  const atCap = turns.turnsGeneratedNextTick === 0;
  const { label } = useCountdown(atCap ? null : turns.nextTurnAt, onTick);

  return (
    <Stat
      label="Turns"
      value={`${formatNumber(turns.turns)} / ${formatNumber(turns.turnCap)}`}
      sub={atCap ? 'At the cap' : `Next +${turns.turnsGeneratedNextTick} in ${label}`}
      meter={{ value: turns.turns, max: turns.turnCap }}
    />
  );
}

export function DashboardPage() {
  const me = useSession((s) => s.me);
  const activity = useSession((s) => s.recentActivity);
  const { refreshing, error, refresh } = useLiveDashboard();

  if (!me) {
    // Either not in the round yet, or the first snapshot has not landed.
    return error ? <Navigate to="/join" replace /> : <GameLayout>{null}</GameLayout>;
  }

  const weapons =
    me.resources.pistols + me.resources.shotguns + me.resources.tek9s + me.resources.ak47s;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">
            {me.displayName} <span className="se-muted se-num">(#{me.publicPimpId})</span>
          </h1>
          <p className="se-eyebrow">{me.city.name}</p>
        </div>
        <div className="se-pagehead__right">
          <span className={`se-sync${refreshing ? ' se-sync--busy' : ''}`} aria-hidden />
          <span className="se-eyebrow">{refreshing ? 'Syncing' : 'Live'}</span>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <div className="se-stats se-mb">
        <Stat label="Net Worth" value={formatCents(me.netWorthCents)} />
        <Stat label="Cash" value={formatCents(me.resources.cashCents)} />
        <TurnsTile turns={me.turns} onTick={() => void refresh(true)} />
        <Stat
          label="Local Rank"
          value={me.rank.local === null ? '-' : `#${formatNumber(me.rank.local)}`}
          sub={<RankMovement movement={me.rank.localMovement} />}
        />
        <Stat
          label="National Rank"
          value={me.rank.national === null ? '-' : `#${formatNumber(me.rank.national)}`}
          sub={<RankMovement movement={me.rank.nationalMovement} />}
        />
      </div>

      <div className="se-grid se-grid--sidebar">
        <div className="se-grid se-grid--2">
          <Panel title="Crew" flush>
            <div className="se-rows">
              <Row label="Whores" value={formatNumber(me.resources.whores)} strong />
              <Row label="Thugs" value={formatNumber(me.resources.thugs)} strong />
              <Row label="Low-Riders" value={formatNumber(me.resources.lowRiders)} />
              <Row label="Payout" value={`${me.payoutPercent}%`} />
            </div>
          </Panel>

          <Panel title="Supplies" flush>
            <div className="se-rows">
              <Row label="Condoms" value={formatNumber(me.resources.condoms)} />
              <Row label="Crack" value={formatNumber(me.resources.crack)} />
              <Row label="Beer" value={formatNumber(me.resources.beer)} />
              <Row label="Medicine" value={formatNumber(me.resources.medicine)} />
            </div>
          </Panel>

          <Panel title="Happiness">
            <HappinessRow label="Whore happiness" value={me.happiness.whore} />
            <HappinessRow label="Thug happiness" value={me.happiness.thug} />
            <p className="se-hint">
              {me.happiness.thug < 100
                ? 'Every thug without a beer and a gun costs a point.'
                : 'Crew is fed and armed.'}
              {' '}
              {me.happiness.whore < 100
                ? 'The girls want a fair cut, condoms and crack on the shelf, and thugs watching them.'
                : ''}
            </p>
          </Panel>

          <Panel title="Weapons" flush>
            <div className="se-rows">
              <Row label="Pistols" value={formatNumber(me.resources.pistols)} />
              <Row label="Shotguns" value={formatNumber(me.resources.shotguns)} />
              <Row label="Tek-9s" value={formatNumber(me.resources.tek9s)} />
              <Row label="AK-47s" value={formatNumber(me.resources.ak47s)} />
              <Row label="Total" value={formatNumber(weapons)} strong />
            </div>
          </Panel>
        </div>

        <aside className="se-grid">
          <PayoutControl />

          <Panel title="Activity" flush>
            <ActivityFeed activity={activity} />
          </Panel>
        </aside>
      </div>
    </GameLayout>
  );
}
