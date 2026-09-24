import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { AdminSeasonChecklistDto, AdminSeasonChecklistItemDto, GameStatusDto } from '@streets/shared';
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
    body: 'Players can join, earn turns, build their crew, run recon and make raid moves until the round clock expires.',
    action: 'Spend turns before they sit at the cap. Run recon first when you need private raid intel.',
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

function checklistTone(status: AdminSeasonChecklistItemDto['status']): string {
  if (status === 'done') return 'se-tag--good';
  if (status === 'warning') return 'se-tag--warn';
  return 'se-tag--bad';
}

export function StatusPage() {
  const account = useSession((s) => s.account);
  const me = useSession((s) => s.me);
  const [status, setStatus] = useState<GameStatusDto | null>(null);
  const [checklist, setChecklist] = useState<AdminSeasonChecklistDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  useEffect(() => {
    roundsApi.status()
      .then(setStatus)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load game status.'));
  }, []);

  useEffect(() => {
    if (!account?.isAdmin) return;
    roundsApi.adminSeasonChecklist()
      .then(setChecklist)
      .catch((caught: unknown) => setChecklistError(caught instanceof ApiError ? caught.message : 'Could not load admin season checklist.'));
  }, [account?.isAdmin]);

  if (!me) return <Navigate to="/join" replace />;

  const round = status?.round;
  const turns = status?.turns;
  const copy = round ? statusCopy(round.status) : null;
  const localDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  return (
    <GameLayout>
      <section className="se-info-hero">
        <span className="se-info-hero__kicker">Street control room</span>
        <h1 className="se-info-hero__title">Game Status</h1>
        <p className="se-info-hero__body">The live round clock, player count, ruleset and turn economy in one place. Use this page to understand the state of the season before you spend a turn.</p>
        {round ? <div className="se-info-hero__metrics"><span className="se-info-chip"><strong>{round.status}</strong> round</span><span className="se-info-chip"><strong>{formatNumber(round.playerCount)}</strong> players</span><span className="se-info-chip"><strong>{formatDuration(round.msRemaining)}</strong> remaining</span></div> : null}
      </section>

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

          <div className="se-status__grid">
            {copy ? (
              <Panel title="Round signal">
                <p>{copy.body}</p>
                <p className="se-hint">{copy.action}</p>
                <div className="se-cta se-mt">
                  <Link className="se-btn se-btn--primary" to="/game/combat">Raid page</Link>
                  <Link className="se-btn" to="/game/news">Latest changes</Link>
                </div>
              </Panel>
            ) : null}

            <div className="se-status__stack"><Panel title="Schedule" flush>
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
          </div>

          {account?.isAdmin ? (
            <Panel title="Admin season checklist" aside={<Link to="/game/admin">Admin panel</Link>}>
              {checklistError ? <Alert>{checklistError}</Alert> : null}
              {!checklist && !checklistError ? <p className="se-muted">Checking season handoff...</p> : null}
              {checklist ? (
                <>
                  <div className="se-stats se-admin-check-stats">
                    <Stat label="Current" value={checklist.currentRound?.name ?? 'None'} />
                    <Stat label="Latest ended" value={checklist.latestEndedRound?.name ?? 'None'} />
                    <Stat label="Next handoff" value={checklist.nextRound?.name ?? 'None'} />
                  </div>
                  <div className="se-admin-checklist">
                    {checklist.items.map((item) => (
                      <article className="se-admin-check" key={item.key}>
                        <div className="se-admin-check__head">
                          <strong>{item.label}</strong>
                          <span className={`se-tag ${checklistTone(item.status)}`}>{item.status}</span>
                        </div>
                        <p>{item.detail}</p>
                        {item.action ? <p className="se-hint">{item.action}</p> : null}
                        {item.href ? <Link className="se-btn se-btn--ghost se-btn--sm" to={item.href}>Open</Link> : null}
                      </article>
                    ))}
                  </div>
                </>
              ) : null}
            </Panel>
          ) : null}
        </>
      ) : status ? <Alert>No active game is running.</Alert> : null}
    </GameLayout>
  );
}
