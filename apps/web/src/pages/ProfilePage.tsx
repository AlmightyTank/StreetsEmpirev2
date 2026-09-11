import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { PublicPlayerProfileDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDate } from '../utils/time.js';

function heldFor(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function movementText(value: number | null): string {
  if (value === null || value === 0) return 'even today';
  return value > 0 ? `up ${formatNumber(value)} today` : `down ${formatNumber(Math.abs(value))} today`;
}

function lastSeen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDate(iso);
}

export function ProfilePage() {
  const me = useSession((s) => s.me);
  const params = useParams<{ publicPimpId?: string }>();
  const target = params.publicPimpId ? Number(params.publicPimpId) : me?.publicPimpId;
  const [player, setPlayer] = useState<PublicPlayerProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target || !Number.isSafeInteger(target)) return;
    setPlayer(null);
    setError(null);
    communityApi.profile(target)
      .then((response) => setPlayer(response.player))
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : 'Could not load that profile.');
      });
  }, [target]);

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">
            {player?.displayName ?? 'Profile'}{' '}
            {player ? <span className="se-muted se-num">(#{player.publicPimpId})</span> : null}
          </h1>
          <p className="se-eyebrow">
            {player ? `${player.city.name}${player.isYou ? ' · Your profile' : ''}` : 'Public street record'}
          </p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {!player && !error ? <Panel title="Profile"><p className="se-muted">Pulling the street record...</p></Panel> : null}

      {player ? (
        <>
          <div className="se-stats se-mb">
            <Stat label="Net Worth" value={formatCents(player.netWorthCents)} tooltip="Public empire value used for rankings. It does not tell you liquid cash or defense." />
            <Stat label="Local Rank" value={`#${formatNumber(player.rank.local)}`} tooltip={`${movementText(player.rank.localMovement)} · held ${heldFor(player.rank.localHeldSinceAt)}`} />
            <Stat label="National Rank" value={`#${formatNumber(player.rank.national)}`} tooltip={`${movementText(player.rank.nationalMovement)} · held ${heldFor(player.rank.nationalHeldSinceAt)}`} />
            <Stat label="Last Seen" value={lastSeen(player.lastActiveAt)} />
          </div>

          <div className="se-grid se-grid--2">
            <Panel title="Public record" flush>
              <div className="se-rows">
                <Row label="Local rank held" value={`${heldFor(player.rank.localHeldSinceAt)} · ${movementText(player.rank.localMovement)}`} />
                <Row label="National rank held" value={`${heldFor(player.rank.nationalHeldSinceAt)} · ${movementText(player.rank.nationalMovement)}`} />
                <Row label="Past rounds" value={formatNumber(player.legacy.roundsPlayed)} />
                <Row label="Past game winnings" value={formatCents(player.legacy.totalFinalNetWorthCents)} strong />
                <Row label="Best past national rank" value={player.legacy.bestNationalRank ? `#${formatNumber(player.legacy.bestNationalRank)}` : 'None'} />
                <Row label="Past round wins" value={formatNumber(player.legacy.roundWins)} />
              </div>
            </Panel>

            <Panel title="Awards">
              {player.awards.length ? (
                <ul className="se-list">
                  {player.awards.map((award) => <li key={award.key}><b>{award.title}</b> — {award.description}</li>)}
                </ul>
              ) : <p className="se-muted">No awards yet.</p>}
            </Panel>
          </div>

          {player.intelRequired ? (
            <Panel title="Recon needed">
              <p>Public profiles show status, money and legacy. They do not show opponent crew, weapons, wounds or exposed cash in this combat round.</p>
              <p className="se-hint">Use recon on the Raids page to reveal fit thugs, wounds, weapons, cash band and max exposed cash for this target.</p>
            </Panel>
          ) : (
            <div className="se-grid se-grid--2">
              <Panel title="Crew" flush>
                <div className="se-rows">
                  <Row label="Whores" value={formatNumber(player.crew!.whores)} strong />
                  <Row label="Thugs" value={formatNumber(player.crew!.thugs)} strong />
                  <Row label="Low-Riders" value={formatNumber(player.lowRiders!)} />
                </div>
              </Panel>

              <Panel title="Weapons" flush>
                <div className="se-rows">
                  <Row label="Pistols" value={formatNumber(player.weapons!.pistols)} />
                  <Row label="Shotguns" value={formatNumber(player.weapons!.shotguns)} />
                  <Row label="Tek-9s" value={formatNumber(player.weapons!.tek9s)} />
                  <Row label="AK-47s" value={formatNumber(player.weapons!.ak47s)} />
                  <Row label="Total" value={formatNumber(player.weapons!.total)} strong />
                </div>
              </Panel>
            </div>
          )}

          <p className="se-hint se-mt">
            Joined {formatDate(player.joinedAt)}. Cash, supplies, payout and crew condition are private.
          </p>
        </>
      ) : null}
    </GameLayout>
  );
}
