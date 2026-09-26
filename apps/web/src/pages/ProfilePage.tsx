import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type {
  PublicAwardDto,
  PublicCareerDto,
  PublicPlayerProfileDto,
  PublicSeasonResultDto,
  PublicStatSheetDto,
} from '@streets/shared';
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
  street: 'Street',
  combat: 'Combat',
  intel: 'Intel',
  turf: 'Turf',
  travel: 'Travel',
  economy: 'Economy',
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

function progressPercent(award: PublicAwardDto): number {
  if (award.unlocked) return 100;
  if (!award.progress || award.progress.target <= 0) return 0;
  return Math.max(0, Math.min(100, (award.progress.current / award.progress.target) * 100));
}

function progressValue(award: PublicAwardDto, value: number): string {
  return award.progress?.unit === 'cents' || award.progress?.label === 'net worth' ? formatCents(value) : formatNumber(value);
}

const rarityRank: Record<PublicAwardDto['rarity'], number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };

function earnedText(award: PublicAwardDto): string {
  if (!award.unlocked) return 'Locked';
  if (award.earnedSeason) return `Earned in ${award.earnedSeason}`;
  return award.earnedAt ? `Earned ${formatDate(award.earnedAt)}` : 'Earned';
}

type StatFormat = 'number' | 'cents' | 'hours';
type StatLine = { label: string; value: number | null; format?: StatFormat };

function statValue(value: number | null, format: StatFormat = 'number'): string {
  if (value === null) return 'Sealed';
  if (format === 'cents') return formatCents(value);
  if (format === 'hours') return `${formatNumber(value)}h`;
  return formatNumber(value);
}

function statGroups(sheet: PublicStatSheetDto): Array<{ key: string; title: string; lines: StatLine[] }> {
  return [
    { key: 'street', title: 'Street', lines: [
      { label: 'Turns worked', value: sheet.street.turnsWorked },
      { label: 'Street earnings', value: sheet.street.streetEarningsCents, format: 'cents' },
      { label: 'Recruits found', value: sheet.street.recruitsFound },
      { label: 'Peak crew size', value: sheet.street.peakCrew },
    ] },
    { key: 'combat', title: 'Combat', lines: [
      { label: 'Raids won', value: sheet.combat.raidsWon },
      { label: 'Raids lost', value: sheet.combat.raidsLost },
      { label: 'Defenses held', value: sheet.combat.defensesHeld },
      { label: 'Defenses lost', value: sheet.combat.defensesLost },
      { label: 'Drive-bys landed', value: sheet.combat.driveBysLanded },
      { label: 'Thugs defeated', value: sheet.combat.thugsDefeated },
      { label: 'Cash stolen', value: sheet.combat.cashStolenCents, format: 'cents' },
      { label: 'Biggest raid', value: sheet.combat.biggestRaidCents, format: 'cents' },
    ] },
    { key: 'turf', title: 'Turf', lines: [
      { label: 'Blocks captured', value: sheet.turf.blocksCaptured },
      { label: 'Blocks lost', value: sheet.turf.blocksLost },
      { label: 'Block-hours held', value: sheet.turf.blockHours, format: 'hours' },
      { label: 'Cities controlled', value: sheet.turf.citiesControlled },
    ] },
    { key: 'travel', title: 'Travel', lines: [
      { label: 'Runs completed', value: sheet.travel.runsCompleted },
      { label: 'Distance driven', value: sheet.travel.driveHours, format: 'hours' },
      { label: 'Cargo moved', value: sheet.travel.cargoMoved },
      { label: 'Convoy hits won', value: sheet.travel.convoyAttacksWon },
    ] },
    { key: 'economy', title: 'Economy', lines: [
      { label: 'Product produced', value: sheet.economy.productProduced },
      { label: 'Product sold', value: sheet.economy.productSold },
      { label: 'Largest transaction', value: sheet.economy.largestTransactionCents, format: 'cents' },
      { label: 'Trader reputation', value: sheet.economy.traderReputation },
    ] },
  ];
}

interface SheetChoice {
  key: string;
  label: string;
  sheet: PublicStatSheetDto;
}

function StatSheetPanel({ choices }: { choices: SheetChoice[] }) {
  const [selected, setSelected] = useState(choices[0]?.key ?? '');
  const choice = choices.find((item) => item.key === selected) ?? choices[0];
  if (!choice) return null;
  return (
    <Panel title="Season stats" className="se-profile-panel se-profile-stats">
      <div className="se-profile-stats__head">
        {choices.length > 1 ? (
          <div className="se-field se-profile-stats__picker">
            <label className="se-label" htmlFor="stat-season">Season</label>
            <select id="stat-season" className="se-input" value={choice.key} onChange={(event) => setSelected(event.target.value)}>
              {choices.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </div>
        ) : <p className="se-eyebrow">{choice.label}</p>}
        <p className="se-hint">
          {choice.sheet.sealed
            ? 'Cash, crew and product numbers stay sealed until this season ends. Stats are history, not power.'
            : 'Built from the season record. Stats and titles are history, not power.'}
        </p>
      </div>
      <div className="se-profile-statgrid">
        {statGroups(choice.sheet).map((group) => (
          <section className="se-profile-statgroup" key={group.key} aria-label={`${group.title} stats`}>
            <h3>{group.title}</h3>
            <div className="se-rows">
              {group.lines.map((line) => (
                <Row
                  key={line.label}
                  label={line.label}
                  value={<span className={line.value === null ? 'se-muted' : 'se-num'}>{statValue(line.value, line.format)}</span>}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}

function AwardStrip({ title, awards, empty, className }: { title: string; awards: PublicAwardDto[]; empty: string; className?: string }) {
  return (
    <Panel title={title} className={`se-profile-panel se-profile-achievements${className ? ` ${className}` : ''}`}>
      {awards.length
        ? <ul className="se-ach-grid">{awards.map((award) => <AchievementCard award={award} key={award.key} />)}</ul>
        : <p className="se-muted">{empty}</p>}
    </Panel>
  );
}

function rankLabel(rank: number | null): string {
  return rank === null ? '-' : `#${formatNumber(rank)}`;
}

function ProfileMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'accent' | 'good' | 'warn';
}) {
  return (
    <div className={`se-profile-metric${tone ? ` se-profile-metric--${tone}` : ''}`}>
      <span className="se-profile-metric__label">{label}</span>
      <strong className="se-profile-metric__value">{value}</strong>
      {detail ? <span className="se-profile-metric__detail">{detail}</span> : null}
    </div>
  );
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
      <p className="se-ach__status">{earnedText(award)}</p>
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
    <Panel title="Achievements" className="se-profile-panel se-profile-achievements">
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
  return (
    <Panel title="Career history" className="se-profile-panel se-profile-career">
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

          {career.hallOfFame.length ? (
            <div className="se-profile-hof">
              <span className="se-eyebrow">Hall of Fame appearances</span>
              <ul className="se-profile-hof__list">
                {career.hallOfFame.map((entry) => (
                  <li key={entry.round.slug} className={`se-profile-hof__item${entry.podium ? ' se-profile-hof__item--podium' : ''}`}>
                    <strong className="se-num">#{formatNumber(entry.nationalRank)}</strong>
                    <span>{entry.round.name}</span>
                    <span className="se-muted">{formatDate(entry.round.endedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
  // This season: achievements earned in the live season, not the permanent carry-overs.
  const thisSeason = unlocked
    .filter((award) => award.category !== 'legacy' && award.category !== 'quest'
      && (!award.earnedSeason || award.earnedSeason === player?.seasonName))
    .sort((a, b) => rarityRank[b.rarity] - rarityRank[a.rarity])
    .slice(0, 6);
  const sheetChoices: SheetChoice[] = [
    ...(player ? [{ key: 'current', label: `${player.seasonName} (live)`, sheet: player.statSheet }] : []),
    ...(career?.seasons ?? []).map((season) => ({ key: season.round.id, label: season.round.name, sheet: season.statSheet })),
  ];
  const locked = player?.awards.filter((award) => !award.unlocked) ?? [];
  const filtersActive = achievementStatusFilter !== 'all' || achievementCategoryFilter !== 'all';
  const filteredAwards = (player?.awards ?? []).filter((award) => {
    const matchesStatus = achievementStatusFilter === 'all'
      || (achievementStatusFilter === 'earned' ? award.unlocked : !award.unlocked);
    const matchesCategory = achievementCategoryFilter === 'all' || award.category === achievementCategoryFilter;
    return matchesStatus && matchesCategory;
  });
  return (
    <GameLayout>
      <div className="se-profile">
        <div className={`se-pagehead${player ? ` se-profile-accent se-profile-accent--${player.cosmetics.accent}` : ''}${player?.cosmetics.frame ? ` se-profile-frame se-profile-frame--${player.cosmetics.frame}` : ''}`}>
        <div>
          <h1 className="se-title">
            {player ? <AllianceTag alliance={player.alliance} /> : null}
            {player?.displayName ?? account?.username ?? 'Profile'}{' '}
            {player ? <span className="se-muted se-num">(#{player.publicPimpId})</span> : null}
          </h1>
          {player?.cosmetics.title ? <p className="se-profile-title">{player.cosmetics.title}</p> : null}
          {player?.crewName ? <p className="se-profile-crew">Crew · <strong>{player.crewName}</strong></p> : null}
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

        {!player && !career && !error ? (
          <div className="se-profile-loading" role="status">Pulling the street record...</div>
        ) : null}

        {!player && career ? <SeasonHistory career={career} /> : null}
        {!player && sheetChoices.length ? <StatSheetPanel key="career" choices={sheetChoices} /> : null}

        {player ? (
          <>
            <section className="se-profile-section">
              <div className="se-profile-sectionhead">
                <div>
                  <span className="se-eyebrow">Current round</span>
                  <h2>Standing right now</h2>
                </div>
                <p>Only public ranking information lives here. Cash on hand, supplies, payout, crew condition, and hidden combat intel stay private.</p>
              </div>

              <div className="se-profile-metrics">
                <ProfileMetric
                  label="Net worth"
                  value={formatCents(player.netWorthCents)}
                  detail="public empire value used for rankings"
                  tone="accent"
                />
                <ProfileMetric
                  label="Local rank"
                  value={`#${formatNumber(player.rank.local)}`}
                  detail={`${movementText(player.rank.localMovement)} · held ${heldFor(player.rank.localHeldSinceAt)}`}
                />
                <ProfileMetric
                  label="National rank"
                  value={`#${formatNumber(player.rank.national)}`}
                  detail={`${movementText(player.rank.nationalMovement)} · held ${heldFor(player.rank.nationalHeldSinceAt)}`}
                />
              </div>
            </section>

            <section className="se-profile-section">
              <div className="se-profile-sectionhead">
                <div>
                  <span className="se-eyebrow">Public intel</span>
                  <h2>{player.intelRequired ? 'Recon keeps the dangerous numbers private' : 'Visible crew & weapons'}</h2>
                </div>
                <span className="se-profile-sectionhead__meta">{player.intelRequired ? 'Combat intel protected' : 'Ruleset exposes exact counts'}</span>
              </div>

              {player.intelRequired ? (
                <Panel title="Recon needed" className="se-profile-panel se-profile-intel">
                  <p>
                    Public profiles show identity, city, net worth, ranks, legacy, badges, and achievements. They do not expose opponent crew, weapons, wounds, cash on hand, or product stash in this combat round.
                  </p>
                  <p className="se-hint">Use recon on the Raids page for combat-ready intelligence on this target.</p>
                </Panel>
              ) : (
                <div className="se-profile-intelgrid">
                  <Panel title="Crew" flush className="se-profile-panel">
                    <div className="se-rows">
                      <Row label="Whores" value={formatNumber(player.crew!.whores)} strong />
                      <Row label="Thugs" value={formatNumber(player.crew!.thugs)} strong />
                      <Row label="Low-Riders" value={formatNumber(player.lowRiders!)} />
                    </div>
                  </Panel>

                  <Panel title="Weapons" flush className="se-profile-panel">
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
            </section>

            {player.showcase.length ? (
              <AwardStrip title="Showcase" awards={player.showcase} empty="" className="se-profile-showcase" />
            ) : null}

            <AwardStrip
              title={`This season · ${player.seasonName}`}
              awards={thisSeason}
              empty="Nothing earned this season yet. The streets are watching."
            />

            <StatSheetPanel key={player.publicPimpId} choices={sheetChoices} />

            {career ? <SeasonHistory career={career} /> : null}

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
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
