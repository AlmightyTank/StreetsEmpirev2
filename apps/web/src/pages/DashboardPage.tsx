import type { ReactNode } from 'react';
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
import { HeatPanel, heatTone } from '../components/HeatPanel.js';
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
/** Where each happiness drag gets fixed. */
const DRAG_FIXES: Record<string, { to: string; label: string }> = {
  condoms: { to: '/game/stores/corner', label: 'Corner Store' },
  beer: { to: '/game/stores/corner', label: 'Corner Store' },
  crack: { to: '/game/stores/pip', label: 'Pip\u2019s' },
  protection: { to: '/game/stores/tommy', label: 'Tommy\u2019s' },
  weapons: { to: '/game/stores/tommy', label: 'Tommy\u2019s' },
  payout: { to: '#payout', label: 'Payout' },
};

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
          {DRAG_FIXES[term.key] ? (
            <Link className="se-golink se-drags__go" to={DRAG_FIXES[term.key]!.to}>{DRAG_FIXES[term.key]!.label}</Link>
          ) : null}
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

function DashboardMetric({
  label,
  value,
  detail,
  tone,
  meter,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'good' | 'warn' | 'bad' | 'accent';
  meter?: { value: number; max: number };
}) {
  const percent = meter && meter.max > 0 ? Math.max(0, Math.min(100, (meter.value / meter.max) * 100)) : null;
  return (
    <div className={`se-dashboard-metric${tone ? ` se-dashboard-metric--${tone}` : ''}`}>
      <span className="se-dashboard-metric__label">{label}</span>
      <strong className="se-dashboard-metric__value">{value}</strong>
      {detail ? <span className="se-dashboard-metric__detail">{detail}</span> : null}
      {percent !== null ? (
        <span className="se-dashboard-metric__meter" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </span>
      ) : null}
    </div>
  );
}

function DashboardAction({
  to,
  title,
  detail,
  meta,
  tone,
}: {
  to: string;
  title: string;
  detail: string;
  meta: string;
  tone?: 'warn' | 'bad' | 'good';
}) {
  return (
    <Link className={`se-dashboard-action${tone ? ` se-dashboard-action--${tone}` : ''}`} to={to}>
      <span className="se-dashboard-action__body">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <span className="se-dashboard-action__meta">{meta}</span>
      <span className="se-dashboard-action__arrow" aria-hidden="true">→</span>
    </Link>
  );
}

function DashboardNotice({
  title,
  detail,
  to,
  action,
  tone = 'warn',
}: {
  title: string;
  detail: string;
  to: string;
  action: string;
  tone?: 'warn' | 'bad' | 'good' | 'info';
}) {
  return (
    <Link className={`se-dashboard-notice se-dashboard-notice--${tone}`} to={to}>
      <span className="se-dashboard-notice__pulse" aria-hidden="true" />
      <span className="se-dashboard-notice__body">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <span className="se-dashboard-notice__action">{action}</span>
    </Link>
  );
}

/** Turns and the next regeneration tick, kept live without changing dashboard APIs. */
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
    <DashboardMetric
      label="Turns"
      value={`${formatNumber(turns.turns)} / ${formatNumber(turns.turnCap)}`}
      detail={atCap ? 'At the cap · spend them' : `Next +${turns.turnsGeneratedNextTick} in ${label}`}
      tone={atCap ? 'warn' : 'accent'}
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
        <Stat label="Hideout Built" value={`${formatNumber(player.hideout.totalLevel)} / ${formatNumber(player.hideout.totalMaxLevel)}`} />
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

function HideoutPanel({ hideout }: { hideout: RoundPlayerDto['hideout'] }) {
  const builtRooms = hideout.rooms.filter((room) => room.level > 0);

  return (
    <Panel title="Hideout" flush className="se-dashboard-panel">
      <div className="se-rows">
        <Row label="Built" value={`${formatNumber(hideout.totalLevel)} / ${formatNumber(hideout.totalMaxLevel)}`} strong />
        {builtRooms.length ? (
          builtRooms.map((room) => (
            <Row
              key={room.key}
              label={room.name}
              value={`${formatNumber(room.level)} / ${formatNumber(room.maxLevel)}`}
            />
          ))
        ) : (
          <Row label="Rooms" value="None yet" />
        )}
      </div>
      <div className="se-actions-row se-dashboard-panel__actions">
        <Link className="se-btn se-btn--primary" to="/game/hideout">Upgrade hideout</Link>
      </div>
    </Panel>
  );
}

function LiveDashboardPage({ me }: { me: RoundPlayerDto }) {
  const activity = useSession((s) => s.recentActivity);
  const { refreshing, error, refresh } = useLiveDashboard();

  const homeWeapons =
    me.resources.pistols + me.resources.shotguns + me.resources.tek9s + me.resources.ak47s;
  const postedWeapons = me.turf?.postedGuns.total ?? 0;
  const weapons = homeWeapons + postedWeapons;
  const productUnits = me.products
    ? me.products.reduce((sum, product) => sum + product.quantity, 0)
    : me.resources.product;
  const heatState = me.heat ? heatTone(me.heat) : 'good';
  const heatLocked = Boolean(me.heat?.lockedUntil);
  const runWaiting = me.run?.phase === 'town';
  const lowWhoreHappiness = me.happiness.whore < 66;
  const lowThugHappiness = me.happiness.thug < 66;
  const atTurnCap = me.turns.turns >= me.turns.turnCap;
  const attentionCount = [
    heatState !== 'good',
    me.convoyAlert !== null && me.convoyAlert !== undefined,
    runWaiting,
    Boolean(me.moving),
    me.resources.woundedThugs > 0,
    me.resources.unarmedThugs > 0,
    lowWhoreHappiness,
    lowThugHappiness,
    atTurnCap,
  ].filter(Boolean).length;

  const suppliesPanel = (
    <Panel title="Supplies" aside={<Link to="/game/stores/corner">Restock</Link>} flush className="se-dashboard-panel">
      <div className="se-dashboard-stockgrid">
        <DashboardMetric label="Condoms" value={formatNumber(me.resources.condoms)} />
        {me.products ? null : <DashboardMetric label="Product" value={formatNumber(me.resources.product)} />}
        <DashboardMetric label="Beer" value={formatNumber(me.resources.beer)} />
        <DashboardMetric label="Medicine" value={formatNumber(me.resources.medicine)} />
      </div>
    </Panel>
  );

  return (
    <GameLayout>
      <div className="se-dashboard">
        <header className="se-dashboard-hero">
          <div className="se-dashboard-hero__identity">
            <span className="se-eyebrow">Command center · {me.city.name}</span>
            <h1>
              {me.displayName}
              <span className="se-dashboard-hero__id">#{me.publicPimpId}</span>
            </h1>
            <p>
              Run the crew, watch the pressure, and jump straight to the move that matters.
            </p>
          </div>
          <div className="se-dashboard-hero__status">
            <div className="se-dashboard-live">
              <span className={`se-sync${refreshing ? ' se-sync--busy' : ''}`} aria-hidden />
              <span>{refreshing ? 'Syncing operation' : 'Operation live'}</span>
            </div>
            <div className="se-dashboard-hero__mini">
              <span><small>Crew</small><strong>{formatNumber(me.resources.whores + me.resources.thugs)}</strong></span>
              <span><small>Weapons</small><strong>{formatNumber(weapons)}</strong></span>
              <span><small>Product</small><strong>{formatNumber(productUnits)}</strong></span>
            </div>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}

        <section className="se-dashboard-metrics" aria-label="Empire snapshot">
          <DashboardMetric
            label="Net worth"
            value={formatCents(me.netWorthCents)}
            detail="Ranking value"
            tone="accent"
          />
          <DashboardMetric
            label="Cash"
            value={formatCents(me.resources.cashCents)}
            detail="Spendable now"
          />
          <TurnsTile turns={me.turns} onTick={() => void refresh(true)} />
          <DashboardMetric
            label="Local rank"
            value={me.rank.local === null ? '—' : `#${formatNumber(me.rank.local)}`}
            detail={<RankMovement movement={me.rank.localMovement} />}
          />
          <DashboardMetric
            label="National rank"
            value={me.rank.national === null ? '—' : `#${formatNumber(me.rank.national)}`}
            detail={<RankMovement movement={me.rank.nationalMovement} />}
          />
        </section>

        <section className="se-dashboard-command">
          <div className="se-dashboard-command__attention">
            <div className="se-dashboard-sectionhead">
              <div>
                <span className="se-eyebrow">Right now</span>
                <h2>Needs attention</h2>
              </div>
              <span className={`se-dashboard-count${attentionCount ? ' se-dashboard-count--hot' : ''}`}>
                {attentionCount ? formatNumber(attentionCount) : 'Clear'}
              </span>
            </div>

            <div className="se-dashboard-notices">
              {heatLocked && me.heat?.lockedUntil ? (
                <DashboardNotice
                  tone="bad"
                  title="You are locked up"
                  detail={`Game actions are blocked until ${new Date(me.heat.lockedUntil).toLocaleString()}.`}
                  to="/game#heat"
                  action="View Heat"
                />
              ) : heatState !== 'good' && me.heat ? (
                <DashboardNotice
                  tone={heatState === 'bad' ? 'bad' : 'warn'}
                  title={heatState === 'bad' ? 'Heat is dangerous' : 'Heat is cutting the take'}
                  detail={`Heat ${formatNumber(me.heat.heat)} / ${formatNumber(me.heat.max)} · cool it before the next run.`}
                  to="/game#heat"
                  action="Cool Heat"
                />
              ) : null}

              {me.convoyAlert ? (
                <DashboardNotice
                  tone={me.convoyAlert.kind === 'tailed' ? 'bad' : 'warn'}
                  title={me.convoyAlert.kind === 'tailed' ? 'Your run is being tailed' : 'An ally called for backup'}
                  detail={`Near ${me.convoyAlert.cityName} · lands ${new Date(me.convoyAlert.landsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`}
                  to="/game/travel"
                  action="Open Travel"
                />
              ) : null}

              {runWaiting && me.run ? (
                <DashboardNotice
                  title="Your run is waiting in town"
                  detail={`The crew is in ${me.run.cityName}; trading only happens while you are there.`}
                  to="/game/travel"
                  action="Manage run"
                />
              ) : null}

              {me.moving ? (
                <DashboardNotice
                  tone="info"
                  title="Your operation is moving"
                  detail={`Relocating to ${me.moving.toName} · arrives ${new Date(me.moving.arrivesAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`}
                  to="/game/travel"
                  action="View move"
                />
              ) : null}

              {me.resources.woundedThugs > 0 ? (
                <DashboardNotice
                  title={`${formatNumber(me.resources.woundedThugs)} thugs are wounded`}
                  detail="Wounded thugs cannot work, defend, raid, or cover the street."
                  to="/game/combat"
                  action="Treat crew"
                />
              ) : null}

              {me.resources.unarmedThugs > 0 ? (
                <DashboardNotice
                  title={`${formatNumber(me.resources.unarmedThugs)} fit thugs are unarmed`}
                  detail="Unarmed crew lower thug happiness and do not count as street cover."
                  to="/game/stores/tommy"
                  action="Buy weapons"
                />
              ) : null}

              {lowWhoreHappiness ? (
                <DashboardNotice
                  title={`Whore happiness is ${me.happiness.whore}%`}
                  detail="Fix the biggest supply, protection, or payout drag before working a long shift."
                  to="#crew-health"
                  action="See causes"
                />
              ) : null}

              {lowThugHappiness ? (
                <DashboardNotice
                  title={`Thug happiness is ${me.happiness.thug}%`}
                  detail="Beer and weapons are the first things to check."
                  to="#crew-health"
                  action="See causes"
                />
              ) : null}

              {atTurnCap ? (
                <DashboardNotice
                  tone="info"
                  title="Turns are at the cap"
                  detail="New turn generation is paused until you spend some."
                  to="/game/scout"
                  action="Spend turns"
                />
              ) : null}

              {attentionCount === 0 ? (
                <div className="se-dashboard-clear">
                  <span className="se-dashboard-clear__mark">✓</span>
                  <div>
                    <strong>The operation is steady.</strong>
                    <span>No urgent Heat, crew, travel, or turn-cap problems right now.</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="se-dashboard-command__actions">
            <div className="se-dashboard-sectionhead">
              <div>
                <span className="se-eyebrow">Make a move</span>
                <h2>Quick actions</h2>
              </div>
            </div>
            <div className="se-dashboard-actions">
              <DashboardAction
                to="/game/scout"
                title="Scout"
                detail="Work a district and find cash, crew, and product."
                meta={`${formatNumber(me.turns.turns)} turns`}
                tone={atTurnCap ? 'warn' : undefined}
              />
              <DashboardAction
                to="/game/produce"
                title="Produce"
                detail="Turn cash and crew time into product."
                meta={`${formatCents(me.resources.cashCents)} cash`}
              />
              <DashboardAction
                to="/game/combat"
                title="Raids"
                detail="Recon targets, attack, or treat wounded thugs."
                meta={`${formatNumber(me.resources.fitThugs)} fit`}
                tone={me.resources.woundedThugs > 0 ? 'warn' : undefined}
              />
              <DashboardAction
                to="/game/stores"
                title="Stores"
                detail="Restock supplies, weapons, vehicles, and product."
                meta={`${formatCents(me.resources.cashCents)}`}
              />
              <DashboardAction
                to="/game/travel"
                title="Travel"
                detail={me.run ? 'Manage the run already on the road.' : 'Load a run, trade cities, or relocate.'}
                meta={me.run ? me.run.cityName : `${formatNumber(me.resources.lowRiders)} Low-Riders`}
                tone={me.convoyAlert ? 'bad' : runWaiting ? 'warn' : undefined}
              />
              <DashboardAction
                to="/game/quests"
                title="Quests"
                detail="Check jobs, contracts, favors, and rewards."
                meta="Contracts"
              />
            </div>
          </div>
        </section>

        <section id="crew-health" className="se-dashboard-section">
          <div className="se-dashboard-sectiontitle">
            <div>
              <span className="se-eyebrow">Crew & inventory</span>
              <h2>Operation health</h2>
            </div>
            <p>Who is ready to work, what they need, and what is sitting on the shelf.</p>
          </div>

          <div className="se-dashboard-coregrid">
            <div className="se-dashboard-stack">
              <Panel title="Crew readiness" flush className="se-dashboard-panel">
                <div className="se-dashboard-stockgrid">
                  <DashboardMetric label="Whores" value={formatNumber(me.resources.whores)} detail="Street crew" />
                  <DashboardMetric label="Thugs" value={formatNumber(me.resources.thugs)} detail={`${formatNumber(me.resources.fitThugs)} fit`} />
                  <DashboardMetric
                    label="Wounded"
                    value={formatNumber(me.resources.woundedThugs)}
                    tone={me.resources.woundedThugs > 0 ? 'warn' : 'good'}
                  />
                  <DashboardMetric
                    label="Unarmed"
                    value={formatNumber(me.resources.unarmedThugs)}
                    tone={me.resources.unarmedThugs > 0 ? 'warn' : 'good'}
                  />
                  <DashboardMetric label="On corners" value={formatNumber(me.resources.postedThugs)} />
                  <DashboardMetric label="Low-Riders" value={formatNumber(me.resources.lowRiders)} />
                </div>
                <div className="se-rows">
                  <Row label="Armed / unarmed" value={`${formatNumber(me.resources.armedThugs)} / ${formatNumber(me.resources.unarmedThugs)}`} />
                  <Row label="Crew payout" value={`${me.payoutPercent}% to the crew · ${100 - me.payoutPercent}% to you`} />
                  {me.run ? (
                    <Row
                      label="Crew on run"
                      value={<Link to="/game/travel">{me.run.phase === 'town' ? `In ${me.run.cityName}` : `Road to ${me.run.cityName}`}</Link>}
                    />
                  ) : null}
                </div>
              </Panel>

              {suppliesPanel}

              <Panel title="Arsenal" aside={<Link to="/game/stores/tommy">Tommy&rsquo;s</Link>} flush className="se-dashboard-panel">
                <div className="se-dashboard-stockgrid">
                  <DashboardMetric label="Pistols" value={formatNumber(me.resources.pistols)} />
                  <DashboardMetric label="Shotguns" value={formatNumber(me.resources.shotguns)} />
                  <DashboardMetric label="Tek-9s" value={formatNumber(me.resources.tek9s)} />
                  <DashboardMetric label="AK-47s" value={formatNumber(me.resources.ak47s)} />
                  <DashboardMetric label="At home" value={formatNumber(homeWeapons)} tone="accent" />
                  <DashboardMetric label="Total owned" value={formatNumber(weapons)} detail={postedWeapons > 0 ? `${formatNumber(postedWeapons)} on corners` : undefined} />
                </div>
              </Panel>
            </div>

            <div className="se-dashboard-stack">
              <Panel title="Crew happiness" className="se-dashboard-panel">
                <div className="se-dashboard-happiness">
                  <div>
                    <HappinessRow label="Whore happiness" value={me.happiness.whore} />
                    <HappinessDrags terms={me.happiness.whoreTerms} />
                  </div>
                  <div>
                    <HappinessRow label="Thug happiness" value={me.happiness.thug} />
                    <HappinessDrags terms={me.happiness.thugTerms} />
                  </div>
                </div>
                {me.happiness.whore === 100 && me.happiness.thug === 100 ? (
                  <p className="se-hint se-good">Everybody is stocked, armed, and content.</p>
                ) : (
                  <p className="se-hint">The penalty rows show exactly what is dragging each crew group down.</p>
                )}
              </Panel>

              {me.products ? (
                <Panel title="Products" aside={<Link to="/game/stores/pip">Trade at Pip&rsquo;s</Link>} flush className="se-dashboard-panel">
                  <div className="se-dashboard-stockgrid">
                    {me.products.map((product) => (
                      <DashboardMetric key={product.key} label={product.name} value={formatNumber(product.quantity)} />
                    ))}
                  </div>
                </Panel>
              ) : null}
            </div>
          </div>
        </section>

        <section className="se-dashboard-section">
          <div className="se-dashboard-sectiontitle">
            <div>
              <span className="se-eyebrow">Control</span>
              <h2>Pressure & progression</h2>
            </div>
            <p>Manage risk, payout, territory, and the upgrades that shape this season.</p>
          </div>

          <div className="se-dashboard-controlgrid">
            <div className="se-dashboard-stack">
              <HeatPanel />
              <HideoutPanel hideout={me.hideout} />
            </div>

            <div className="se-dashboard-stack">
              <PayoutControl />

              {me.turf ? (
                <Panel title="City Blocks" aside={<Link to="/game/turf">Manage turf</Link>} flush className="se-dashboard-panel">
                  <div className="se-dashboard-stockgrid">
                    <DashboardMetric label="Blocks held" value={formatNumber(me.turf.blocksHeld)} tone="accent" />
                    <DashboardMetric label="Corner guns" value={formatNumber(me.turf.postedGuns.total)} />
                    <DashboardMetric label="Tax today" value={formatCents(me.turf.taxEarnedTodayCents)} tone="good" />
                    <DashboardMetric label="Payers today" value={formatNumber(me.turf.taxPayersToday)} />
                  </div>
                  {me.turf.taxPendingCents > 0 ? (
                    <div className="se-rows">
                      <Row label="Pending settle" value={formatCents(me.turf.taxPendingCents)} strong />
                    </div>
                  ) : null}
                </Panel>
              ) : null}
            </div>
          </div>
        </section>

        <section className="se-dashboard-section">
          <div className="se-dashboard-sectiontitle se-dashboard-sectiontitle--activity">
            <div>
              <span className="se-eyebrow">Recent moves</span>
              <h2>Activity</h2>
            </div>
            <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/activity">Full activity log</Link>
          </div>
          <Panel title="Latest activity" flush className="se-dashboard-panel se-dashboard-panel--activity">
            <ActivityFeed activity={activity} />
          </Panel>
        </section>
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
