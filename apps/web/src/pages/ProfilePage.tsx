import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { PublicAwardDto, PublicCareerDto, PublicPlayerProfileDto, PublicSeasonResultDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { ContactButton } from '../components/ContactButton.js';
import { HideoutRoomChips } from '../components/HideoutRoomChips.js';
import { ProfileBadges } from '../components/ProfileBadges.js';
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
  hideout: 'Hideout',
  quest: 'Quest',
  legacy: 'Legacy',
};

const achievementCategories = Object.keys(categoryName) as PublicAwardDto['category'][];
type AchievementStatusFilter = 'all' | 'earned' | 'locked';
type AchievementCategoryFilter = 'all' | PublicAwardDto['category'];

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

function rankLabel(rank: number | null): string {
  return rank === null ? '-' : `#${formatNumber(rank)}`;
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

function AchievementsPanel({
  unlocked,
  locked,
  filteredAwards,
  filtersActive,
  showLockedAchievements,
  setShowLockedAchievements,
  achievementStatusFilter,
  setAchievementStatusFilter,
  achievementCategoryFilter,
  setAchievementCategoryFilter,
}: {
  unlocked: PublicAwardDto[];
  locked: PublicAwardDto[];
  filteredAwards: PublicAwardDto[];
  filtersActive: boolean;
  showLockedAchievements: boolean;
  setShowLockedAchievements: Dispatch<SetStateAction<boolean>>;
  achievementStatusFilter: AchievementStatusFilter;
  setAchievementStatusFilter: Dispatch<SetStateAction<AchievementStatusFilter>>;
  achievementCategoryFilter: AchievementCategoryFilter;
  setAchievementCategoryFilter: Dispatch<SetStateAction<AchievementCategoryFilter>>;
}) {
  return (
    <Panel title="Achievements">
      <div className="se-ach-filters" aria-label="Achievement filters">
        <div className="se-filter-group">
          <span className="se-filter-label">Show</span>
          <div className="se-seg" role="group" aria-label="Achievement status">
            {([
              ['all', 'All'],
              ['earned', 'Earned'],
              ['locked', 'Locked'],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`se-seg__btn${achievementStatusFilter === value ? ' se-seg__btn--on' : ''}`}
                aria-pressed={achievementStatusFilter === value}
                onClick={() => setAchievementStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="se-filter-group">
          <span className="se-filter-label">Type</span>
          <div className="se-seg" role="group" aria-label="Achievement category">
            <button
              type="button"
              className={`se-seg__btn${achievementCategoryFilter === 'all' ? ' se-seg__btn--on' : ''}`}
              aria-pressed={achievementCategoryFilter === 'all'}
              onClick={() => setAchievementCategoryFilter('all')}
            >
              All
            </button>
            {achievementCategories.map((category) => (
              <button
                type="button"
                key={category}
                className={`se-seg__btn${achievementCategoryFilter === category ? ' se-seg__btn--on' : ''}`}
                aria-pressed={achievementCategoryFilter === category}
                onClick={() => setAchievementCategoryFilter(category)}
              >
                {categoryName[category]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtersActive ? (
        <div className="se-ach-section">
          <div className="se-ach-section__head">
            <h3>Filtered trophies</h3>
            <span className="se-num">{formatNumber(filteredAwards.length)}</span>
          </div>
          {filteredAwards.length
            ? <ul className="se-ach-grid">{filteredAwards.map((award) => <AchievementCard award={award} key={award.key} />)}</ul>
            : <p className="se-muted">No achievements match those filters.</p>}
        </div>
      ) : (
        <>
          <div className="se-ach-section">
            <div className="se-ach-section__head">
              <h3>Earned</h3>
              <span className="se-num">{formatNumber(unlocked.length)}</span>
            </div>
            {unlocked.length ? <ul className="se-ach-grid">{unlocked.map((award) => <AchievementCard award={award} key={award.key} />)}</ul> : <p className="se-muted">No achievements earned yet.</p>}
          </div>
          <div className="se-ach-section">
            <div className="se-ach-section__head">
              <h3 id="next-milestones-title">Next milestones</h3>
              {locked.length ? (
                <button
                  type="button"
                  className="se-btn se-btn--ghost se-btn--sm se-ach-toggle"
                  aria-expanded={showLockedAchievements}
                  aria-controls="next-milestones-list"
                  onClick={() => setShowLockedAchievements((open) => !open)}
                >
                  {showLockedAchievements ? 'Hide' : 'Show'} {formatNumber(locked.length)}
                </button>
              ) : <span className="se-num">0</span>}
            </div>
            {locked.length ? (
              <div
                id="next-milestones-list"
                aria-labelledby="next-milestones-title"
                className={`se-collapse${showLockedAchievements ? ' se-collapse--open' : ''}`}
                inert={!showLockedAchievements}
              >
                <div className="se-collapse__inner">
                  <ul className="se-ach-grid">{locked.map((award) => <AchievementCard award={award} key={award.key} />)}</ul>
                </div>
              </div>
            ) : <p className="se-muted">Every listed achievement is unlocked.</p>}
          </div>
        </>
      )}
    </Panel>
  );
}

function SeasonHistory({ career }: { career: PublicCareerDto }) {
  const latest = career.seasons[0];
  return (
    <Panel title="Season history">
      {career.seasons.length === 0 ? (
        <p className="se-muted">Finished seasons will land here. Every season starts fresh; this page keeps the receipts.</p>
      ) : (
        <div className="se-grid">
          <div className="se-stats">
            <Stat label="Finished Seasons" value={formatNumber(career.legacy.roundsPlayed)} />
            <Stat label="Best National" value={rankLabel(career.legacy.bestNationalRank)} />
            <Stat label="Top 10s" value={formatNumber(career.legacy.topTenFinishes)} />
            <Stat label="Season Wins" value={formatNumber(career.legacy.roundWins)} />
          </div>

          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>City</th>
                  <th className="se-table__number">National</th>
                  <th className="se-table__number">Local</th>
                  <th className="se-table__number">Final Net Worth</th>
                  <th className="se-table__number">Hideout</th>
                  <th className="se-table__number">Raids</th>
                  <th className="se-table__number">Drive-bys</th>
                  <th className="se-table__number">Recon</th>
                </tr>
              </thead>
              <tbody>
                {career.seasons.map((season: PublicSeasonResultDto) => (
                  <tr key={season.round.id}>
                    <td className="se-td--title">
                      <strong>{season.round.name}</strong>
                      <br />
                      <span className="se-muted">{formatDate(season.round.endedAt)}</span>
                    </td>
                    <td data-label="City">{season.city.name}</td>
                    <td className="se-table__number se-num" data-label="National">{rankLabel(season.rank.national)}</td>
                    <td className="se-table__number se-num" data-label="Local">{rankLabel(season.rank.local)}</td>
                    <td className="se-table__number se-num" data-label="Final net worth">{formatCents(season.finalNetWorthCents)}</td>
                    <td className="se-table__number" data-label="Hideout"><HideoutRoomChips hideout={season.hideout} /></td>
                    <td className="se-table__number se-num" data-label="Raids">{formatNumber(season.stats.raidAttackWins)} / {formatNumber(season.stats.raidAttacks)}</td>
                    <td className="se-table__number se-num" data-label="Drive-bys">{formatNumber(season.stats.driveByWins)} / {formatNumber(season.stats.driveByAttacks)}</td>
                    <td className="se-table__number se-num" data-label="Recon">{formatNumber(season.stats.reconRuns)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {latest ? (
            <p className="se-hint">
              Latest finish: {latest.round.name}, national {rankLabel(latest.rank.national)}, local {rankLabel(latest.rank.local)}. Cash, crew, supplies and cooldowns stayed in that season.
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

export function ProfilePage() {
  const me = useSession((s) => s.me);
  const account = useSession((s) => s.account);
  const params = useParams<{ publicPimpId?: string; forumUserId?: string }>();
  const target = params.publicPimpId ? Number(params.publicPimpId) : me?.publicPimpId;
  const [player, setPlayer] = useState<PublicPlayerProfileDto | null>(null);
  const [career, setCareer] = useState<PublicCareerDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLockedAchievements, setShowLockedAchievements] = useState(false);
  const [achievementStatusFilter, setAchievementStatusFilter] = useState<AchievementStatusFilter>('all');
  const [achievementCategoryFilter, setAchievementCategoryFilter] = useState<AchievementCategoryFilter>('all');

  useEffect(() => {
    if (params.forumUserId || (target && Number.isSafeInteger(target))) {
      let active = true;
      setPlayer(null);
      setCareer(null);
      setError(null);
      (params.forumUserId ? communityApi.forumProfile(params.forumUserId) : communityApi.profile(target!))
        .then((response) => {
          if (!active) return;
          setPlayer(response.player);
          setCareer(response.player.career);
        })
        .catch((caught: unknown) => {
          if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load that profile.');
        });
      return () => { active = false; };
    }

    let active = true;
    setPlayer(null);
    setCareer(null);
    setError(null);
    communityApi.career()
      .then((response) => { if (active) setCareer(response.career); })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load your season history.');
      });
    return () => { active = false; };
  }, [target, params.forumUserId]);

  if (!me && (params.publicPimpId || params.forumUserId)) return <Navigate to="/game" replace />;

  const unlocked = player?.awards.filter((award) => award.unlocked) ?? [];
  const locked = player?.awards.filter((award) => !award.unlocked) ?? [];
  const filtersActive = achievementStatusFilter !== 'all' || achievementCategoryFilter !== 'all';
  const filteredAwards = (player?.awards ?? []).filter((award) => {
    const matchesStatus = achievementStatusFilter === 'all'
      || (achievementStatusFilter === 'earned' ? award.unlocked : !award.unlocked);
    const matchesCategory = achievementCategoryFilter === 'all' || award.category === achievementCategoryFilter;
    return matchesStatus && matchesCategory;
  });
  const rarest = unlocked.find((award) => ['legendary', 'epic', 'rare'].includes(award.rarity));

  return (
    <GameLayout>
      <div className={`se-pagehead${player ? ` se-profile-accent se-profile-accent--${player.cosmetics.accent}` : ''}`}>
        <div>
          <h1 className="se-title">
            {player ? <AllianceTag alliance={player.alliance} /> : null}
            {player?.displayName ?? account?.username ?? 'Profile'}{' '}
            {player ? <span className="se-muted se-num">(#{player.publicPimpId})</span> : null}
          </h1>
          {player?.cosmetics.title ? <p className="se-profile-title">{player.cosmetics.title}</p> : null}
          <p className="se-eyebrow">
            {player ? `${player.city.name}${player.isYou ? ' · Your profile' : ''}` : 'Permanent season record'}
          </p>
          {player ? <ProfileBadges badges={player.badges} forumGroups={player.forumGroups} /> : null}
        </div>
        <div className="se-inline-actions">
          {player && !player.isYou ? <ContactButton publicPimpId={player.publicPimpId} /> : null}
          {player?.forumProfileUrl ? <a className="se-btn se-btn--ghost se-btn--sm" href={player.forumProfileUrl}>Forum Profile</a> : null}
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {!player && !career && !error ? <Panel title="Profile"><p className="se-muted">Pulling the street record...</p></Panel> : null}

      {!player && career ? <SeasonHistory career={career} /> : null}

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
                <Row label="Best past local rank" value={player.legacy.bestLocalRank ? `#${formatNumber(player.legacy.bestLocalRank)}` : 'None'} />
                <Row label="Past top 10s" value={formatNumber(player.legacy.topTenFinishes)} />
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

          {career ? <SeasonHistory career={career} /> : null}

          {player.intelRequired ? (
            <Panel title="Recon needed">
              <p>Public profiles show status, money, legacy and achievements. They do not show opponent crew, weapons, wounds, exposed cash or product stash in this combat round.</p>
              <p className="se-hint">Use recon on the Raids page to reveal fit thugs, wounds, weapons, cash band, product stash and max loot for this target.</p>
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

          <AchievementsPanel
            unlocked={unlocked}
            locked={locked}
            filteredAwards={filteredAwards}
            filtersActive={filtersActive}
            showLockedAchievements={showLockedAchievements}
            setShowLockedAchievements={setShowLockedAchievements}
            achievementStatusFilter={achievementStatusFilter}
            setAchievementStatusFilter={setAchievementStatusFilter}
            achievementCategoryFilter={achievementCategoryFilter}
            setAchievementCategoryFilter={setAchievementCategoryFilter}
          />
        </div>
      ) : null}
    </GameLayout>
  );
}
