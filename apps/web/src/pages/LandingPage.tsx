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

  return (
    <Shell>
      <div className="se-grid se-grid--sidebar">
        <div>
          <p className="se-eyebrow">Classic OG &middot; Ruleset {round?.rulesetId ?? 'classic-og-v0.2-e'}</p>
          <h1 className="se-display se-hero">
            Run the block.
            <br />
            <span className="se-accent">Own the city.</span>
          </h1>

          <p className="se-lede">
            Every ten minutes you get two more turns. Spend them scouting, cooking,
            stacking cash or raiding rivals &mdash; then watch where that lands you
            on the board. Turns are the only currency that never comes back.
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
            <Panel title="The loop">
              <ul className="se-list">
                <li>Scout the districts for clients, whores and thugs.</li>
                <li>Keep them stocked, armed and paid, or they walk.</li>
                <li>Cook crack, move it, and turn cash into net worth.</li>
                <li>Climb the local and national boards before the round ends.</li>
              </ul>
            </Panel>

            <Panel title="Still being built">
              <ul className="se-list se-list--muted">
                <li>Deeper combat tactics</li>
                <li>Alliances and alliance rankings</li>
                <li>Travel between cities</li>
                <li>Messaging, console and rolodex</li>
              </ul>
              <p className="se-hint">
                Raids and drive-bys are live in onboarding rounds with local rivals. Bigger PvP systems come after
                the core attack loop feels fair and readable.
              </p>
            </Panel>
          </div>
        </div>

        <aside>
          {round ? (
            <Panel title={round.name} aside={round.status} flush>
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
