import { Link } from 'react-router-dom';
import { classicOgV01, rulesets } from '@streets/rulesets';
import { Panel, Row } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';
import { formatDate, formatDuration } from '../utils/time.js';

export function LandingPage() {
  const { account, round, me } = useSession();

  const cta = !account
    ? { to: '/register', label: 'Claim your name' }
    : me
      ? { to: '/game', label: 'Back to the block' }
      : { to: '/join', label: `Enter ${round?.name ?? 'the game'}` };

  const ruleset = round ? (rulesets[round.rulesetId] ?? classicOgV01) : null;
  const activeRound = round?.status === 'ACTIVE';

  return (
    <Shell>
      <div className="se-grid se-grid--sidebar">
        <div>
          <p className="se-eyebrow">Street Empire &middot; 28 day strategy rounds</p>
          <h1 className="se-display se-hero">
            Build your crew.
            <br />
            <span className="se-accent">Take the streets.</span>
          </h1>

          <p className="se-lede">
            Street Empire is a round-based crime strategy game. Start with a small block,
            spend your turns scouting districts, working the street, stocking your crew
            and making raid moves against rivals. The board is public, but the best intel
            still belongs to players who put eyes on a target first.
          </p>

          <div className="se-cta">
            <Link className="se-btn se-btn--primary" to={cta.to}>
              {cta.label}
            </Link>
            {!account ? (
              <Link className="se-btn se-btn--ghost" to="/login">
                I already have a name
              </Link>
            ) : null}
          </div>

          <hr className="se-hr" />

          <div className="se-grid se-grid--2">
            <Panel title="How the round plays">
              <ul className="se-list">
                <li>Turns come back over time. Use them to scout, produce, attack or build.</li>
                <li>Money, crew size, weapons, drugs and supplies all feed your net worth.</li>
                <li>Stores unlock better gear as your reputation with each trader grows.</li>
                <li>Rankings show money, rank streaks, movement, awards and past legacy.</li>
              </ul>
            </Panel>

            <Panel title="Raids are live">
              <ul className="se-list">
                <li>Cash raids take exposed money and crack from a scouted mark.</li>
                <li>Drive-bys soften a block and can cost you a Low-Rider if nobody makes it home.</li>
                <li>Drug runs burn a rival&apos;s hoes, crack and condoms.</li>
                <li>Ride theft and lure runs steal cars or unhappy crew when the hit lands.</li>
              </ul>
            </Panel>

            <Panel title="Your account travels with you">
              <ul className="se-list">
                <li>Log in with email and password or Discord single sign-on.</li>
                <li>Recover your account by email when you lose your password.</li>
                <li>Link Discord and manage your recovery email from account settings.</li>
                <li>Achievements, awards and past winnings build your public legacy.</li>
              </ul>
            </Panel>

            <Panel title="Community next">
              <p>
                The game should have a real street forum beside the round: announcements,
                rival talk, crew recruiting, bug reports and war stories.
              </p>
              <p className="se-hint">
                The best next fit is Discourse with Street Empire/Discord SSO, so players can move between the
                game and community without juggling separate accounts.
              </p>
            </Panel>
          </div>
        </div>

        <aside>
          {round ? (
            <Panel title={round.name} aside={activeRound ? 'Open now' : round.status} flush>
              <div className="se-rows">
                <Row label="Status" value={round.status} />
                <Row
                  label="Time remaining"
                  value={formatDuration(round.msRemaining)}
                  strong
                />
                <Row label="Started" value={formatDate(round.startsAt)} />
                <Row label="Ends" value={formatDate(round.endsAt)} />
                <Row label="Players" value={round.playerCount} />
                <Row label="Turns" value={ruleset ? `+${ruleset.turns.amountPerInterval} every ${ruleset.turns.intervalMinutes} min` : '—'} />
                <Row label="Maximum turns" value={ruleset ? String(ruleset.turns.cap) : '—'} />
                <Row
                  label="Ruleset"
                  value={`${round.rulesetId}@${round.rulesetVersion}`}
                />
              </div>
              <div className="se-cta se-mt">
                <Link className="se-btn se-btn--primary" to={cta.to}>
                  {cta.label}
                </Link>
                <Link className="se-btn" to="/news">
                  Latest changes
                </Link>
              </div>
            </Panel>
          ) : (
            <Panel title="No game running">
              <p className="se-dim">
                There is no round open right now. Check back soon.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </Shell>
  );
}
