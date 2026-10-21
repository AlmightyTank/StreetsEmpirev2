import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type {
  PublicAwardDto,
  PublicCareerDto,
  PublicLegacyEntryDto,
  PublicPlayerProfileDto,
  PublicSeasonResultDto,
  PublicStatSheetDto,
  SecretCollectionDto,
  DiscoveredSecretDto,
  CareerStoryActiveDto,
  CareerStoryArchiveDto,
} from '@streets/shared';
import { formatCents, formatNumber, profileNameParts, SIGNATURE_CARD_FRAME_KEY } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { BirthdayCake } from '../components/BirthdayCake.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { ContactButton } from '../components/ContactButton.js';
import { CareerGuidance, CareerMetricStrip, CareerNavigation } from '../components/CareerExperience.js';
import { CareerStoryPanel } from '../components/CareerStoryPanel.js';
import { HideoutRoomChips } from '../components/HideoutRoomChips.js';
import { ProfileBadgeArt } from '../components/ProfileBadgeArt.js';
import { ProfileBadges } from '../components/ProfileBadges.js';
import { NameWithSupporterMark } from '../components/SupporterMark.js';
import { hasProfileLook, ProfileLook } from '../components/ProfileLook.js';
import { StreetSignDisplay } from '../components/StreetSignBuilder.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { AvatarPortrait, hasAvatarFrameArt } from '../components/BuiltAvatar.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { usePageTheme } from '../stores/pageTheme.js';
import { useSession } from '../stores/session.js';
import { formatDate, formatElapsed } from '../utils/time.js';
import { RivalryTimeline } from '../components/RivalryTimeline.js';

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
  casino: 'Casino',
  law: 'Law',
  legacy: 'Legacy',
};

const achievementCategories = Object.keys(categoryName) as PublicAwardDto['category'][];
type AchievementStatusFilter = 'all' | 'earned' | 'locked';
type AchievementCategoryFilter = 'all' | PublicAwardDto['category'];

const heldFor = (iso: string) => formatElapsed(iso);

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

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

function AchievementCard({ award }: { award: PublicAwardDto }) {
  const percent = progressPercent(award);
  return (
    <li className={`se-ach se-ach--${award.rarity}${award.unlocked ? '' : ' se-ach--locked'}`}>
      <ProfileBadgeArt
        badgeKey={award.key}
        category={award.category}
        rarity={award.rarity}
        size={52}
        locked={!award.unlocked}
      />
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
                  {showLockedAchievements ? (
                    <ul className="se-ach-grid">{locked.map((award) => <AchievementCard award={award} key={award.key} />)}</ul>
                  ) : null}
                </div>
              </div>
            ) : <p className="se-muted">Every listed achievement is unlocked.</p>}
          </div>
        </>
      )}
    </Panel>
  );
}

const secretStatusLabel: Record<string, string> = {
  AVAILABLE: 'Trail open',
  ACTIVE: 'Investigating',
  READY_TO_TURN_IN: 'Ready to close',
  COMPLETED: 'Case closed',
  EXPIRED: 'Trail cold',
  FAILED: 'Trail cold',
  LOCKED: 'Whisper',
};

function familyLabel(family: string): string {
  return family.toLowerCase().split('_').filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

const secretTierLabel: Record<string, string> = {
  OBVIOUS: 'Out in the open',
  HIDDEN: 'Hidden',
  LEGENDARY: 'Legendary',
};

function DiscoveryCard({ secret }: { secret: DiscoveredSecretDto }) {
  return (
    <li className={`se-ach se-ach--discovery se-ach--tier-${secret.discoveryTier.toLowerCase()}`}>
      <div className="se-ach__top">
        <span className="se-ach__cat">{familyLabel(secret.family)}</span>
        <span className="se-ach__rarity">{secretTierLabel[secret.discoveryTier] ?? secret.discoveryTier}</span>
      </div>
      <h3 className="se-ach__title">{secret.title}</h3>
      <p className="se-ach__desc">{secret.description}</p>
      {secret.contactName ? <p className="se-ach__status">Contact: {secret.contactName}</p> : null}
      {secret.clues.length ? (
        <ul className="se-discovery-clues">
          {secret.clues.map((clue) => {
            const percent = clue.target > 0 ? Math.max(0, Math.min(100, (clue.current / clue.target) * 100)) : 0;
            return (
              <li key={clue.id} className="se-discovery-clue">
                <span className="se-discovery-clue__label" aria-label={clue.completed ? `${clue.description} (found)` : clue.description}>
                  {clue.completed ? '✓ ' : '○ '}{clue.description}
                </span>
                <div
                  className="se-ach__meter"
                  role="progressbar"
                  aria-label={clue.description}
                  aria-valuenow={Math.min(clue.current, clue.target)}
                  aria-valuemin={0}
                  aria-valuemax={clue.target}
                >
                  <span style={{ width: `${percent}%` }} />
                </div>
                <span className="se-ach__progress-text">{formatNumber(Math.min(clue.current, clue.target))} / {formatNumber(clue.target)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {secret.rewardLabels.length ? (
        <p className="se-ach__desc">On the table: {secret.rewardLabels.join(' · ')}{secret.claimed ? ' (claimed)' : ''}</p>
      ) : null}
      <p className="se-ach__status">{secretStatusLabel[secret.status] ?? secret.status}</p>
      <Link className="se-btn se-btn--ghost se-btn--sm" to={`/quests#quest-${secret.questKey}`}>
        Follow up in the quest journal
      </Link>
    </li>
  );
}

function DiscoveriesPanel({ discoveries }: { discoveries: SecretCollectionDto | undefined }) {
  if (!discoveries) return null;
  const { inProgress, trophies, families } = discoveries;
  if (!inProgress.length && !trophies.length) {
    return (
      <Panel title="Secrets / Discoveries" className="se-profile-panel se-profile-achievements">
        <p className="se-muted">No discoveries yet. The streets keep their secrets until you stumble into one.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Secrets / Discoveries" className="se-profile-panel se-profile-achievements">
      {inProgress.length ? (
        <div className="se-ach-section">
          <div className="se-ach-section__head">
            <h3>Open investigations</h3>
            <span className="se-num">{formatNumber(inProgress.length)}</span>
          </div>
          <p className="se-muted">Clues found this season. A new season starts every trail over.</p>
          <ul className="se-ach-grid">{inProgress.map((secret) => <DiscoveryCard secret={secret} key={secret.questKey} />)}</ul>
        </div>
      ) : null}
      {families.length ? (
        <div className="se-ach-section">
          <div className="se-ach-section__head">
            <h3>Case files</h3>
            <span className="se-num">{formatNumber(families.length)}</span>
          </div>
          <ul className="se-discovery-families">
            {families.map((family) => (
              <li key={family.family}>
                <span aria-label={`${familyLabel(family.family)}: ${family.found} uncovered${family.undiscovered ? `, ${family.undiscovered} still hidden` : ', fully uncovered'}`}>
                  {familyLabel(family.family)} — {formatNumber(family.found)} uncovered{family.undiscovered ? `, ${formatNumber(family.undiscovered)} still hidden (?)` : ', fully uncovered'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {trophies.length ? (
        <div className="se-ach-section">
          <div className="se-ach-section__head">
            <h3>Kept forever</h3>
            <span className="se-num">{formatNumber(trophies.length)}</span>
          </div>
          <p className="se-muted">Trophies survive every season reset.</p>
          <ul className="se-ach-grid">
            {trophies.map((trophy) => (
              <li className={`se-ach se-ach--discovery se-ach--trophy se-ach--${trophy.rarity.toLowerCase()}`} key={trophy.key}>
                <div className="se-ach__top">
                  <span className="se-ach__cat">{trophy.family ? familyLabel(trophy.family) : 'Secret'}</span>
                  <span className="se-ach__rarity">{trophy.rarity}</span>
                </div>
                <h3 className="se-ach__title">{trophy.title}</h3>
                <p className="se-ach__desc">{trophy.description}</p>
                <p className="se-ach__status">Earned {formatDate(trophy.earnedAt)} · kept forever</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

function legacyKindLabel(kind: string): string {
  if (kind === 'season_finish') return 'Season finish';
  if (kind === 'daily_cover') return 'Streets Daily cover';
  if (kind === 'city_event') return 'City memory';
  return 'Legacy receipt';
}

function SeasonHistory({
  career,
  isOwner,
  onLegacyEntriesChange,
}: {
  career: PublicCareerDto;
  isOwner: boolean;
  onLegacyEntriesChange: (entries: PublicLegacyEntryDto[]) => void;
}) {
  const entries = career.legacyEntries ?? [];
  const featured = entries.find((entry) => entry.featured) ?? null;
  const [legacyBusy, setLegacyBusy] = useState<string | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);

  async function featureLegacy(entryId: string | null) {
    setLegacyBusy(entryId ?? 'clear');
    setLegacyError(null);
    try {
      const response = await communityApi.featureLegacy(entryId);
      onLegacyEntriesChange(response.entries);
    } catch (caught: unknown) {
      setLegacyError(caught instanceof ApiError ? caught.message : 'Could not update the featured receipt.');
    } finally {
      setLegacyBusy(null);
    }
  }

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

      {entries.length ? (
        <section className="se-legacy" aria-labelledby="empire-legacy-title">
          <div className="se-legacy__head">
            <div><span className="se-eyebrow">Permanent · cosmetic only</span><h3 id="empire-legacy-title">Empire Legacy</h3></div>
            <span className="se-muted se-num">{formatNumber(entries.length)} receipts</span>
          </div>
          {featured ? (
            <article className="se-legacy-featured">
              <span className="se-legacy-card__kind">Featured · {legacyKindLabel(featured.kind)}</span>
              <strong>{featured.title}</strong>
              <span>{featured.round.name} · {formatDate(featured.round.endedAt)}</span>
              {isOwner ? <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={legacyBusy !== null} onClick={() => void featureLegacy(null)}>{legacyBusy === 'clear' ? 'Clearing…' : 'Clear showcase'}</button> : null}
            </article>
          ) : null}
          {legacyError ? <Alert>{legacyError}</Alert> : null}
          <div className="se-legacy-grid">
            {entries.map((entry) => (
              <article key={entry.id} className={`se-legacy-card${entry.featured ? ' is-featured' : ''}`}>
                <span className="se-legacy-card__kind">{legacyKindLabel(entry.kind)}</span>
                <strong>{entry.title}</strong>
                <span className="se-muted">{entry.round.name} · {formatDate(entry.awardedAt)}</span>
                {isOwner && !entry.featured ? <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={legacyBusy !== null} onClick={() => void featureLegacy(entry.id)}>{legacyBusy === entry.id ? 'Featuring…' : 'Feature on profile'}</button> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
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
  const [careerStory, setCareerStory] = useState<CareerStoryActiveDto | null>(null);
  const [careerStoryPortfolio, setCareerStoryPortfolio] = useState<CareerStoryArchiveDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showLockedAchievements, setShowLockedAchievements] = useState(false);
  const [achievementStatusFilter, setAchievementStatusFilter] = useState<AchievementStatusFilter>('all');
  const [achievementCategoryFilter, setAchievementCategoryFilter] = useState<AchievementCategoryFilter>('all');
  // Slice E: visitors see the owner's site theme here, and can switch back to their own.
  const [useMyTheme, setUseMyTheme] = useState(false);
  const setPageTheme = usePageTheme((s) => s.setThemeKey);
  const isYou = Boolean(player && me && player.publicPimpId === me.publicPimpId);
  const avatarFrame = player?.cosmetics.avatarFrame === undefined
    ? player?.cosmetics.frame ?? null
    : player.cosmetics.avatarFrame ?? null;
  // The Signature Profile Card (a supporter reward) is on while its frame is equipped; the mark comes with it.
  const signature = avatarFrame === SIGNATURE_CARD_FRAME_KEY;
  const ownerTheme = player && !isYou ? player.cosmetics.siteTheme ?? null : null;
  const shownTheme = useMyTheme ? null : ownerTheme;
  const isOwnProfileRoute = !params.publicPimpId && !params.forumUserId;

  useEffect(() => {
    setPageTheme(shownTheme);
    return () => setPageTheme(null);
  }, [shownTheme, setPageTheme]);

  useEffect(() => setUseMyTheme(false), [target, params.forumUserId]);

  useEffect(() => {
    if (params.forumUserId || (target && Number.isSafeInteger(target))) {
      let active = true;
      setPlayer(null);
      setCareer(null);
      setCareerStory(null);
      setCareerStoryPortfolio([]);
      setError(null);
      (params.forumUserId ? communityApi.forumProfile(params.forumUserId) : communityApi.profile(target!))
        .then((response) => {
          if (!active) return;
          setPlayer(response.player);
           setCareer(response.player.career);
           void communityApi.publicCareerStoryPortfolio(response.player.publicPimpId).then((result) => { if (active) setCareerStoryPortfolio(result.portfolio); }).catch(() => undefined);
        })
        .catch((caught: unknown) => {
          if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load that profile.');
        });
      return () => { active = false; };
    }

    let active = true;
    setPlayer(null);
    setCareer(null);
    setCareerStory(null);
    setCareerStoryPortfolio([]);
    setError(null);
    Promise.all([communityApi.career(), communityApi.careerStory(), communityApi.careerStoryPortfolio()])
      .then(([response, storyResponse, portfolioResponse]) => { if (active) { setCareer(response.career); setCareerStory(storyResponse.story); setCareerStoryPortfolio(portfolioResponse.portfolio); } })
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
  const updateLegacyEntries = (entries: PublicLegacyEntryDto[]) => {
    setCareer((current) => current ? { ...current, legacyEntries: entries } : current);
  };
  return (
    <GameLayout>
      <div className={`se-profile${shownTheme ? ` se-profile--themed se-site-theme--${shownTheme}` : ''}`}>
        {player && ownerTheme ? (
          <div className="se-profile-themebar" role="status">
            <span>
              {useMyTheme
                ? `${player.displayName} styled this profile with ${player.cosmetics.siteThemeLabel ?? 'their own theme'}.`
                : `Viewing in ${player.displayName}'s ${player.cosmetics.siteThemeLabel ?? 'site theme'}.`}
            </span>
            <button type="button" className="se-btn se-btn--sm" onClick={() => setUseMyTheme((current) => !current)}>
              {useMyTheme ? 'Show their theme' : 'Use my theme'}
            </button>
          </div>
        ) : null}
        {isOwnProfileRoute ? <CareerNavigation active="profile" /> : null}
        <div
          className={`se-pagehead se-profile-pagehead${player ? ` se-profile-accent se-profile-accent--${player.cosmetics.accent}` : ''}${player ? ` se-profile-effect se-profile-effect--${player.cosmetics.effect}` : ''}${signature ? ' se-signature-card' : ''}`}
          data-avatar-frame={avatarFrame ?? 'none'}
          data-surface={signature ? player?.cosmetics.surface ?? 'brushed' : undefined}
        >
          {player ? (
            <div
              className={`se-profile-pagehead__banner${player.cosmetics.bannerUrl ? ' se-profile-pagehead__banner--uploaded' : ''}${player.look?.crewBanner ? ' se-profile-pagehead__banner--crew' : ''}`}
              data-crew-banner={player.look?.crewBanner ?? undefined}
              aria-hidden="true"
              style={player.cosmetics.bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(5, 8, 12, 0.9), rgba(5, 8, 12, 0.58) 48%, rgba(5, 8, 12, 0.78)), url("${player.cosmetics.bannerUrl}")` } : undefined}
            />
          ) : null}
          <div className="se-profile-pagehead__main">
            {player ? (
              <span className={`se-profile-pagehead__avatar${avatarFrame ? ` se-profile-pagehead__avatar--framed se-profile-pagehead__avatar--${avatarFrame}` : ''}${avatarFrame && hasAvatarFrameArt(avatarFrame) ? ' se-profile-pagehead__avatar--art' : ''}`} aria-hidden="true">
                <AvatarPortrait imageUrl={player.cosmetics.imageUrl} avatar={player.cosmetics.avatar} fallback={initials(player.displayName)} frameKey={avatarFrame} live />
              </span>
            ) : null}
            <div>
              <h1 className="se-title">
                {player ? <AllianceTag alliance={player.alliance} /> : null}
                {player
                  ? <><span className="se-profile-name">{profileNameParts(player.displayName, player.cosmetics.title).map((part, index, parts) => (
                    <span className={`se-profile-name__part se-profile-name__part--${part.kind}`} key={index}>
                      {player.isSupporter && index === parts.length - 1 ? <NameWithSupporterMark text={part.text} /> : part.text}
                    </span>
                  ))}</span>{player.birthdayToday ? <BirthdayCake /> : null}{' '}</>
                  : account?.username ?? 'Profile'}
                {player ? <span className="se-muted se-num">(#{player.publicPimpId})</span> : null}
              </h1>
              {signature ? <span className="se-profile-nameplate-rule" aria-hidden="true" /> : null}
              {player?.crewName ? <p className="se-profile-crew">Crew · <strong>{player.crewName}</strong></p> : null}
              <StreetSignDisplay design={player?.streetSign} />
              {player?.streetSign && !player.isYou ? (() => {
                const query = new URLSearchParams({
                  category: 'PLAYER_CONTENT',
                  from: `/game/players/${player.publicPimpId}`,
                  target: player.displayName,
                  sign: `${player.streetSign.streetName} ${player.streetSign.streetType}${player.streetSign.tag ? ` · tag: ${player.streetSign.tag}` : ''}`,
                });
                return <Link className="se-btn se-btn--ghost se-btn--sm" to={`/report-bug?${query.toString()}`}>Report street sign</Link>;
              })() : null}
              {player?.careerIdentity ? <p className="se-profile-career" title="Cosmetic career identity; it does not change gameplay power.">Career · <strong>{player.careerIdentity.title}</strong></p> : null}
              {player?.factionAlignment?.length ? (
                <p className="se-profile-alignment" aria-label="Faction alignment">
                  {player.factionAlignment.map((faction) => (
                    <span key={faction.key} className={`se-profile-alignment__chip${faction.tierName === 'Inner Circle' ? ' is-inner' : ''}`}>
                      {faction.name} · {faction.tierName}
                    </span>
                  ))}
                </p>
              ) : null}
              {player?.streetSkillBadges?.length ? (
                <p className="se-street-skill-badges" aria-label="Street skill points">
                  {player.streetSkillBadges.map((badge) => <span className="se-street-skill-badge" key={badge.skill}>{badge.label} <strong>{badge.points}</strong></span>)}
                </p>
              ) : null}
              <p className="se-eyebrow">
                {player ? `${player.city.name}${player.isYou ? ' · Your profile' : ''}` : 'Permanent season record'}
              </p>
              {player?.profileBio ? <p className="se-profile-bio">{player.profileBio}</p> : null}
              {player ? <ProfileBadges badges={player.badges} forumGroups={player.forumGroups} /> : null}
            </div>
          </div>
          <div className="se-inline-actions">
            {isOwnProfileRoute ? <Link className="se-btn se-btn--ghost se-btn--sm" to="/account#settings-profile">Customize appearance</Link> : null}
            {player && !player.isYou ? <Link className="se-btn se-btn--ghost se-btn--sm" to={`/game/console?to=${player.publicPimpId}`}>Message</Link> : null}
            {player && !player.isYou ? <ContactButton publicPimpId={player.publicPimpId} /> : null}
            {player?.forumProfileUrl ? <a className="se-btn se-btn--ghost se-btn--sm" href={player.forumProfileUrl}>Forum Profile</a> : null}
          </div>
        </div>

        {error ? <Alert>{error}</Alert> : null}

        {isOwnProfileRoute ? (
          <RivalryTimeline roundId={useSession.getState().round?.id ?? ''} />
        ) : null}

        {isOwnProfileRoute ? (
          <CareerGuidance title="Public record and appearance settings">
            <p>Your profile brings together current standing, achievements, earned titles, showcase awards, and finished-season history. Private cash, supplies, crew condition, and protected combat intel are not exposed here.</p>
            <p>Appearance stays separate from progression. Equip earned or supporter cosmetics in Account Settings without changing your level, achievements, or game power.</p>
          </CareerGuidance>
        ) : null}

        {!player && !career && !error ? (
          <div className="se-profile-loading" role="status">Pulling the street record...</div>
        ) : null}

        {!player && career ? <SeasonHistory career={career} isOwner onLegacyEntriesChange={updateLegacyEntries} /> : null}
        {isOwnProfileRoute ? <CareerStoryPanel story={careerStory} portfolio={careerStoryPortfolio} owner onChanged={() => void communityApi.careerStory().then((result) => setCareerStory(result.story))} /> : null}
        {player && !isYou ? <CareerStoryPanel story={null} portfolio={careerStoryPortfolio} /> : null}
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

              <CareerMetricStrip
                label="Current round standing"
                className="se-profile-metrics"
                items={[
                  { label: 'Net worth', value: formatCents(player.netWorthCents), detail: 'public empire value used for rankings', tone: 'accent' },
                  { label: 'Local rank', value: `#${formatNumber(player.rank.local)}`, detail: `${movementText(player.rank.localMovement)} · held ${heldFor(player.rank.localHeldSinceAt)}` },
                  { label: 'National rank', value: `#${formatNumber(player.rank.national)}`, detail: `${movementText(player.rank.nationalMovement)} · held ${heldFor(player.rank.nationalHeldSinceAt)}` },
                ]}
              />
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

            {hasProfileLook(player.look) ? <ProfileLook look={player.look} isYou={isYou} /> : null}

            {player.showcase.length ? (
              <AwardStrip title="Showcase" awards={player.showcase} empty="" className="se-profile-showcase" />
            ) : null}

            <AwardStrip
              title={`This season · ${player.seasonName}`}
              awards={thisSeason}
              empty="Nothing earned this season yet. The streets are watching."
            />

            <StatSheetPanel key={player.publicPimpId} choices={sheetChoices} />

            {career ? <SeasonHistory career={career} isOwner={player.isYou} onLegacyEntriesChange={updateLegacyEntries} /> : null}

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

            <DiscoveriesPanel discoveries={player.discoveries} />
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
