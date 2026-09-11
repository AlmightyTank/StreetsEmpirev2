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
            <Stat label="Net Worth" value={player.netWorthCents === null ? 'Hidden' : formatCents(player.netWorthCents)} tooltip={player.intelRequired ? 'Exact opponent net worth requires recon in this combat round.' : undefined} />
            <Stat label="Local Rank" value={`#${formatNumber(player.rank.local)}`} />
            <Stat label="National Rank" value={`#${formatNumber(player.rank.national)}`} />
            <Stat label="Last Seen" value={lastSeen(player.lastActiveAt)} />
          </div>

          {player.intelRequired ? (
            <Panel title="Intel needed">
              <p>Public profiles no longer show opponent crew, weapons or exact net worth in this combat round.</p>
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
