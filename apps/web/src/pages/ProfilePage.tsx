import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { PublicAwardDto, PublicPlayerProfileDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDate } from '../utils/time.js';

const categoryName: Record<PublicAwardDto['category'], string> = {
  rank: 'Rank',
  wealth: 'Wealth',
  combat: 'Combat',
  intel: 'Intel',
  reputation: 'Reputation',
  legacy: 'Legacy',
};

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

function progressPercent(award: PublicAwardDto): number {
  if (award.unlocked) return 100;
  if (!award.progress || award.progress.target <= 0) return 0;
  return Math.max(0, Math.min(100, (award.progress.current / award.progress.target) * 100));
}

function progressValue(award: PublicAwardDto, value: number): string {
  return award.progress?.label === 'net worth' ? formatCents(value) : formatNumber(value);
}

function AchievementCard({ award }: { award: PublicAwardDto }) {
  const percent = progressPercent(award);
  return (
    <li className={`se-ach se-ach--${award.rarity}${award.unlocked ? '' : ' se-ach--locked'}`}>
      <div className="se-ach__top">
        <span className="se-ach__cat">{categoryName[award.category]}</span>
        <span className="se-ach__rarity">{award.rarity}</span>
      </div>
      <h3 className="se-ach__title">{award.title}</h3>
      <p className="se-ach__desc">{award.description}</p>
      {award.progress ? (
        <div className="se-ach__progress">
          <div className="se-ach__meter" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
          <p className="se-ach__progress-text">
            {progressValue(award, Math.min(award.progress.current, award.progress.target))} / {progressValue(award, award.progress.target)} {award.progress.label}
          </p>
        </div>
      ) : null}
      <p className="se-ach__status">{award.unlocked ? (award.earnedAt ? `Earned ${formatDate(award.earnedAt)}` : 'Earned') : 'Locked'}</p>
    </li>
  );
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

  const unlocked = player?.awards.filter((award) => award.unlocked) ?? [];
  const locked = player?.awards.filter((award) => !award.unlocked) ?? [];
  const rarest = unlocked.find((award) => ['legendary', 'epic', 'rare'].includes(award.rarity));

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
        <div className="se-profile-stack">
          <div className="se-stats">
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

            <Panel title="Achievement summary" flush>
              <div className="se-rows">
                <Row label="Unlocked" value={`${formatNumber(unlocked.length)} / ${formatNumber(player.awards.length)}`} strong />
                <Row label="Locked" value={formatNumber(locked.length)} />
                <Row label="Rarest earned" value={rarest ? `${rarest.title} (${rarest.rarity})` : 'None yet'} />
                <Row label="Featured" value={unlocked.slice(0, 3).map((award) => award.title).join(', ') || 'None yet'} />
              </div>
            </Panel>
          </div>

          <Panel title="Achievements">
            <div className="se-ach-section">
              <div className="se-ach-section__head">
                <h3>Earned</h3>
                <span className="se-num">{formatNumber(unlocked.length)}</span>
              </div>
              {unlocked.length ? <ul className="se-ach-grid">{unlocked.map((award) => <AchievementCard award={award} key={award.key} />)}</ul> : <p className="se-muted">No achievements earned yet.</p>}
            </div>
            <div className="se-ach-section">
              <div className="se-ach-section__head">
                <h3>Next milestones</h3>
                <span className="se-num">{formatNumber(locked.length)}</span>
              </div>
              {locked.length ? <ul className="se-ach-grid">{locked.map((award) => <AchievementCard award={award} key={award.key} />)}</ul> : <p className="se-muted">Every listed achievement is unlocked.</p>}
            </div>
          </Panel>

          {player.intelRequired ? (
            <Panel title="Recon needed">
              <p>Public profiles show status, money, legacy and achievements. They do not show opponent crew, weapons, wounds, exposed cash or crack stash in this combat round.</p>
              <p className="se-hint">Use recon on the Raids page to reveal fit thugs, wounds, weapons, cash band, crack stash and max loot for this target.</p>
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

          <p className="se-hint se-profile-footer">
            Joined {formatDate(player.joinedAt)}. Cash, supplies, payout and crew condition are private.
          </p>
        </div>
      ) : null}
    </GameLayout>
  );
}
