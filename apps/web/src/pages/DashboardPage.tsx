import { Link, Navigate } from 'react-router-dom';
import type { HappinessTermDto, RoundDto, RoundOverDto, RoundPlayerDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { ActivityFeed } from '../components/ActivityFeed.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { PayoutControl } from '../components/PayoutControl.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useLiveDashboard } from '../hooks/useLiveDashboard.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDate, formatDuration } from '../utils/time.js';

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

/**
 * A low number is useless without the reason. Buying condoms cannot fix a
 * stable whose real problem is the payout, so name the drags in order.
 */
function HappinessDrags({ terms }: { terms: HappinessTermDto[] }) {
  const costing = terms.filter((t) => t.penalty > 0).sort((a, b) => b.penalty - a.penalty);
  if (costing.length === 0) return null;

  return (
    <ul className="se-drags">
      {costing.map((term) => (
        <li
          className="se-drags__item"
          key={term.key}
          title={`${term.label} is costing ${term.penalty} happiness point${term.penalty === 1 ? '' : 's'}${term.fix ? `. ${term.fix}` : '.'}`}
          tabIndex={0}
        >
          <span className="se-drags__head">
            <span className="se-drags__label">{term.label}</span>
            <span className="se-num se-bad">&minus;{term.penalty}</span>
          </span>
          {term.fix ? <span className="se-drags__fix">{term.fix}</span> : null}
        </li>
      ))}
    </ul>
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

function RoundOverScreen({ roundOver, nextRound, canJoin }: { roundOver: RoundOverDto; nextRound: RoundDto | null; canJoin: boolean }) {
  const player = roundOver.player;
  const nationalFinish = player.rank.national === null ? '-' : `#${formatNumber(player.rank.national)}`;
  const localFinish = player.rank.local === null ? '-' : `#${formatNumber(player.rank.local)}`;
  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <p className="se-eyebrow">Season complete</p>
          <h1 className="se-title">{roundOver.round.name} is over</h1>
        </div>
        <div className="se-pagehead__right">
          <span className="se-eyebrow">Final standings</span>
        </div>
      </div>

      <div className="se-stats se-mb">
        <Stat label="Final Net Worth" value={formatCents(player.netWorthCents)} />
        <Stat label="Cash Left" value={formatCents(player.cashCents)} />
        <Stat label="National Finish" value={nationalFinish} />
        <Stat label="Local Finish" value={localFinish} />
      </div>

      <Panel title="What carried forward">
        <div className="se-season-callouts">
          <div className="se-season-callout se-season-callout--saved">
            <strong>Permanent record saved</strong>
            <span>
              {roundOver.round.name} now counts in your legacy: {nationalFinish} national,
              {` ${localFinish}`} local, {formatCents(player.netWorthCents)} final net worth.
            </span>
          </div>
          <div className="se-season-callout">
            <strong>Fresh mechanics next season</strong>
            <span>Cash, crew, supplies, turns, weapons, intel and cooldowns stay in this season. The next round starts clean.</span>
          </div>
          <div className="se-season-callout">
            <strong>Cosmetics stay permanent</strong>
            <span>Legacy badges and profile cosmetics remain on your account and can be featured from Login & settings.</span>
          </div>
        </div>

        {roundOver.newLegacyBadges.length ? (
          <>
            <p className="se-trophies__label">New permanent badges</p>
            <ul className="se-badges se-badges--block">
              {roundOver.newLegacyBadges.map((badge) => (
                <li
                  className={`se-badge se-badge--${badge.rarity} se-badge--permanent`}
                  key={badge.key}
                  title={badge.description}
                >
                  {badge.title}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="se-hint">No new legacy badge unlocked this time, but the finish still counts in your permanent record.</p>
        )}
      </Panel>

      <div className="se-grid se-grid--sidebar">
        <Panel title={`${player.displayName} (#${player.publicPimpId})`} flush>
          <div className="se-rows">
            <Row label="City" value={player.city.name} />
            <Row label="Joined" value={formatDate(player.joinedAt)} />
            <Row label="Season ended" value={formatDate(roundOver.round.endsAt)} strong />
            <Row label="Players" value={roundOver.round.playerCount} />
            <Row label="Legacy seasons" value={formatNumber(roundOver.legacy.roundsPlayed)} />
            <Row label="Best national" value={roundOver.legacy.bestNationalRank === null ? '-' : `#${formatNumber(roundOver.legacy.bestNationalRank)}`} />
          </div>
        </Panel>

        <aside className="se-grid">
          <Panel title={nextRound ? 'Next round' : 'Between rounds'}>
            {nextRound ? (
              <>
                <p className="se-dim">
                  {nextRound.name} is {nextRound.status.toLowerCase()}. {nextRound.msRemaining > 0 ? `${formatDuration(nextRound.msRemaining)} remain on the clock.` : 'The clock has not opened yet.'}
                </p>
                <ol className="se-list se-season-steps">
                  <li>Review your saved finish here or in Hall of Fame.</li>
                  <li>Enter the next round from a fresh starting state.</li>
                  <li>Rebuild and chase the new leaderboard on equal footing.</li>
                </ol>
                <div className="se-actions-row se-mt">
                  <Link className="se-btn se-btn--primary" to="/join">{canJoin ? 'Enter next round' : 'View next round'}</Link>
                  <Link className="se-btn" to="/game/profile">Your legacy</Link>
                  <Link className="se-btn" to="/game/hall-of-fame">Hall of fame</Link>
                </div>
              </>
            ) : (
              <>
                <p className="se-dim">No new round is open yet. Your final result is saved to your legacy.</p>
                <div className="se-actions-row se-mt">
                  <Link className="se-btn" to="/game/profile">Your legacy</Link>
                  <Link className="se-btn" to="/game/hall-of-fame">Hall of fame</Link>
                  <Link className="se-btn" to="/game/news">Development wire</Link>
                </div>
              </>
            )}
          </Panel>
        </aside>
      </div>
    </GameLayout>
  );
}

function LiveDashboardPage({ me }: { me: RoundPlayerDto }) {
  const activity = useSession((s) => s.recentActivity);
  const { refreshing, error, refresh } = useLiveDashboard();

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
        <Stat label="Net Worth" value={formatCents(me.netWorthCents)} tooltip="Cash and owned goods converted through the round ruleset. Rankings use this value." />
        <Stat label="Cash" value={formatCents(me.resources.cashCents)} tooltip="Spendable money. Raids can only take cash above the protected cash floor." />
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
          <div className="se-grid">
            <Panel title="Crew" flush>
              <div className="se-rows">
                <Row label="Whores" value={formatNumber(me.resources.whores)} strong tooltip="The crew earning on the street. They need condoms, crack, payout and protection." />
                <Row label="Thugs" value={formatNumber(me.resources.thugs)} strong tooltip="Only fit thugs can work, defend or raid. In 0.2.0-H, only armed fit thugs protect the street effectively." />
                {me.resources.woundedThugs > 0 ? <Row label="Fit / wounded" value={`${formatNumber(me.resources.fitThugs)} / ${formatNumber(me.resources.woundedThugs)}`} tooltip="Wounded thugs remain yours, but they do not count for actions until they recover or get treated." /> : null}
                <Row label="Armed / unarmed" value={`${formatNumber(me.resources.armedThugs)} / ${formatNumber(me.resources.unarmedThugs)}`} tooltip="Every fit thug wants a weapon. Unarmed thugs lower thug happiness and do not count as street cover in 0.2.0-H." />
                <Row label="Low-Riders" value={formatNumber(me.resources.lowRiders)} />
                <Row label="Payout" value={`${me.payoutPercent}%`} tooltip="The crew cut from street work. Lower cuts can drag whore happiness down." />
              </div>
            </Panel>

            <Panel title="Happiness">
              <HappinessRow label="Whore happiness" value={me.happiness.whore} />
              <p className="se-hint">Hover the penalty rows to see what each drag means.</p>
              <HappinessDrags terms={me.happiness.whoreTerms} />

              <hr className="se-hr" />

              <HappinessRow label="Thug happiness" value={me.happiness.thug} />
              <HappinessDrags terms={me.happiness.thugTerms} />
              {me.happiness.whore === 100 && me.happiness.thug === 100 ? (
                <p className="se-hint">Everybody is stocked, armed and rested.</p>
              ) : null}
            </Panel>
          </div>

          <div className="se-grid">
            <Panel title="Supplies" flush>
              <div className="se-rows">
                <Row label="Condoms" value={formatNumber(me.resources.condoms)} />
                <Row label="Crack" value={formatNumber(me.resources.crack)} />
                <Row label="Beer" value={formatNumber(me.resources.beer)} />
                <Row label="Medicine" value={formatNumber(me.resources.medicine)} />
              </div>
            </Panel>

            <Panel title="Weapons" flush>
              <div className="se-rows">
                <Row label="Pistols" value={formatNumber(me.resources.pistols)} tooltip="Any weapon arms one thug for happiness and street coverage; stronger guns also improve combat strength." />
                <Row label="Shotguns" value={formatNumber(me.resources.shotguns)} />
                <Row label="Tek-9s" value={formatNumber(me.resources.tek9s)} />
                <Row label="AK-47s" value={formatNumber(me.resources.ak47s)} />
                <Row label="Total" value={formatNumber(weapons)} strong tooltip="Total guns available. Keep this at or above fit thugs to avoid unarmed penalties." />
              </div>
            </Panel>
          </div>
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

export function DashboardPage() {
  const me = useSession((s) => s.me);
  const roundOver = useSession((s) => s.roundOver);
  const round = useSession((s) => s.round);
  const canJoin = useSession((s) => s.canJoin);

  if (me) return <LiveDashboardPage me={me} />;
  if (roundOver) return <RoundOverScreen roundOver={roundOver} nextRound={round} canJoin={canJoin} />;

  return <Navigate to="/join" replace />;
}
