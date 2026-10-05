import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EXPERIENCE_LEVEL_REWARDS, experienceRequiredForLevel, formatCents, formatNumber, type PlayerExperienceDto, type PlayerExperienceEventDto, type PublicCareerDto } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { gameApi } from '../api/game.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatWhen } from '../utils/time.js';

const CAREER_MILESTONES = [
  { key: 'veteran', title: 'Veteran', description: 'Finish your first season.', reward: 'Veteran profile title and badge', metric: 'roundsPlayed', target: 1, rarity: 'common' },
  { key: 'top-finisher', title: 'Top Finisher', description: 'Finish a season in the national top ten.', reward: 'Top Finisher profile title and badge', metric: 'topTenFinishes', target: 1, rarity: 'rare' },
  { key: 'kingpin', title: 'Kingpin', description: 'Finish a season on the national podium.', reward: 'Kingpin profile title and badge', metric: 'podiumFinishes', target: 1, rarity: 'epic' },
  { key: 'past-winner', title: 'Past Winner', description: 'Win a season at national rank #1.', reward: 'Past Winner profile title and badge', metric: 'roundWins', target: 1, rarity: 'legendary' },
  { key: 'hall-of-fame', title: 'Hall of Fame', description: 'Win three seasons at national rank #1.', reward: 'Hall of Fame profile title and badge', metric: 'roundWins', target: 3, rarity: 'legendary' },
] as const;

type CareerMetric = (typeof CAREER_MILESTONES)[number]['metric'];

function metricValue(career: PublicCareerDto | null, metric: CareerMetric): number {
  if (!career) return 0;
  return career.legacy[metric];
}

export function XpProgressPage() {
  const accountId = useSession((state) => state.account?.id ?? null);
  const liveExperience = useSession((state) => state.me?.experience ?? null);
  const [loadedExperience, setLoadedExperience] = useState<PlayerExperienceDto | null>(null);
  const [career, setCareer] = useState<PublicCareerDto | null>(null);
  const [xpEvents, setXpEvents] = useState<PlayerExperienceEventDto[]>([]);
  const [experienceLoading, setExperienceLoading] = useState(true);
  const [careerLoading, setCareerLoading] = useState(true);
  const [experienceError, setExperienceError] = useState(false);
  const [careerError, setCareerError] = useState(false);
  const experienceRequestId = useRef(0);
  const lastObservedXp = useRef<{ accountId: string; totalXp: number } | null>(null);

  useEffect(() => {
    let active = true;
    const requestId = ++experienceRequestId.current;
    setLoadedExperience(null);
    setCareer(null);
    setXpEvents([]);
    setExperienceError(false);
    setCareerError(false);
    setExperienceLoading(Boolean(accountId));
    setCareerLoading(Boolean(accountId));

    if (!accountId) {
      lastObservedXp.current = null;
      setExperienceLoading(false);
      setCareerLoading(false);
      return () => { active = false; };
    }

    void gameApi.experience()
      .then((response) => {
        if (!active || requestId !== experienceRequestId.current) return;
        setLoadedExperience(response.experience);
        setXpEvents(response.events);
      })
      .catch(() => {
        if (active && requestId === experienceRequestId.current) setExperienceError(true);
      })
      .finally(() => {
        if (active && requestId === experienceRequestId.current) setExperienceLoading(false);
      });
    void communityApi.career()
      .then((response) => { if (active) setCareer(response.career); })
      .catch(() => { if (active) setCareerError(true); })
      .finally(() => { if (active) setCareerLoading(false); });

    return () => { active = false; };
  }, [accountId]);

  useEffect(() => {
    if (liveExperience) setLoadedExperience(liveExperience);
  }, [liveExperience]);

  useEffect(() => {
    if (!accountId) {
      lastObservedXp.current = null;
      return;
    }
    if (!liveExperience) return;

    const previous = lastObservedXp.current;
    lastObservedXp.current = { accountId, totalXp: liveExperience.totalXp };
    if (!previous || previous.accountId !== accountId || liveExperience.totalXp <= previous.totalXp) return;

    let active = true;
    const requestId = ++experienceRequestId.current;
    setExperienceError(false);
    setExperienceLoading(true);
    void gameApi.experience()
      .then((response) => {
        if (!active || requestId !== experienceRequestId.current) return;
        setLoadedExperience(response.experience);
        setXpEvents(response.events);
      })
      .catch(() => {
        if (active && requestId === experienceRequestId.current) setExperienceError(true);
      })
      .finally(() => {
        if (active && requestId === experienceRequestId.current) setExperienceLoading(false);
      });
    return () => { active = false; };
  }, [accountId, liveExperience?.totalXp]);

  const experience = loadedExperience ?? liveExperience;
  const level = experience?.level ?? 1;
  const totalXp = experience?.totalXp ?? 0;
  const nextLevel = level + 1;
  const nextLevelTotal = experienceRequiredForLevel(nextLevel);
  const claimedRewards = EXPERIENCE_LEVEL_REWARDS.filter((reward) => reward.level <= level);
  const nextReward = EXPERIENCE_LEVEL_REWARDS.find((reward) => reward.level > level) ?? null;
  const nextRewardXp = nextReward ? experienceRequiredForLevel(nextReward.level) : null;
  const previousRewardXp = claimedRewards.length > 0 ? experienceRequiredForLevel(claimedRewards[claimedRewards.length - 1]!.level) : 0;
  const rewardProgress = nextRewardXp
    ? Math.max(0, Math.min(100, Math.floor(((totalXp - previousRewardXp) / (nextRewardXp - previousRewardXp)) * 100)))
    : 100;
  const legacy = career?.legacy;
  const finishedSeasons = career?.seasons ?? [];
  const lifetimeRaidWins = finishedSeasons.reduce((total, season) => total + season.stats.raidAttackWins, 0);
  const lifetimeJobs = finishedSeasons.reduce((total, season) => total + season.stats.jobsCompleted, 0);
  const lifetimeRecon = finishedSeasons.reduce((total, season) => total + season.stats.reconRuns, 0);

  return (
    <GameLayout>
      <div className="se-pass se-xp-progress">
        <header className="se-pass-hero">
          <div className="se-pass-hero__copy">
            <span className="se-eyebrow">Career progression · carries between seasons</span>
            <h1>XP Progress</h1>
            <p>Build your account level, earn permanent profile cosmetics, and track the history you leave behind. XP rewards are cosmetic and never give a gameplay advantage.</p>
          </div>
          <div className="se-pass-hero__progress">
            <div>
              <span>Current level</span>
              <strong>{experienceLoading && !experience ? '...' : formatNumber(level)}</strong>
            </div>
            <div className="se-pass-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={experience?.progressPercent ?? 0} aria-label={experience ? `Progress to level ${nextLevel}` : 'Lifetime XP progress'}>
              <span style={{ width: `${experience?.progressPercent ?? 0}%` }} />
            </div>
            <small>
              {experienceLoading && !experience
                ? 'Loading lifetime XP...'
                : experience
                  ? `${formatNumber(experience.xpIntoLevel)} / ${formatNumber(experience.xpForLevel)} XP · ${formatNumber(experience.xpToNextLevel)} to level ${formatNumber(nextLevel)}`
                  : 'Lifetime XP is not available right now.'}
            </small>
          </div>
        </header>

        <div className="se-xp-overview" aria-label="XP summary">
          <div>
            <span>Titles unlocked</span>
            <strong>{formatNumber(claimedRewards.length)} / {formatNumber(EXPERIENCE_LEVEL_REWARDS.length)}</strong>
          </div>
          <div>
            <span>Next level starts</span>
            <strong>{formatNumber(nextLevelTotal)} XP</strong>
          </div>
        </div>

        <section className="se-pass-info se-xp-info">
          <Panel title="Lifetime stats" className="se-pass-panel">
            {experienceError && !experience ? <p className="se-muted">Could not load your lifetime XP right now.</p> : null}
            <div className="se-xp-lifetime-grid">
              <Stat label="Lifetime XP" value={experience ? formatNumber(totalXp) : experienceLoading ? 'Loading...' : '-'} />
              <Stat label="Finished seasons" value={legacy ? formatNumber(legacy.roundsPlayed) : careerLoading ? 'Loading...' : '-'} />
              <Stat label="Season wins" value={legacy ? formatNumber(legacy.roundWins) : careerLoading ? 'Loading...' : '-'} />
              <Stat label="National top 10s" value={legacy ? formatNumber(legacy.topTenFinishes) : careerLoading ? 'Loading...' : '-'} />
              <Stat label="National podiums" value={legacy ? formatNumber(legacy.podiumFinishes) : careerLoading ? 'Loading...' : '-'} />
              <Stat label="Best national rank" value={legacy?.bestNationalRank ? `#${formatNumber(legacy.bestNationalRank)}` : legacy ? '-' : careerLoading ? 'Loading...' : '-'} />
              <Stat label="Raid wins" value={career ? formatNumber(lifetimeRaidWins) : careerLoading ? 'Loading...' : '-'} />
              <Stat label="Jobs completed" value={career ? formatNumber(lifetimeJobs) : careerLoading ? 'Loading...' : '-'} />
              <Stat label="Recon runs" value={career ? formatNumber(lifetimeRecon) : careerLoading ? 'Loading...' : '-'} />
              <Stat label="Combined season-end net worth" value={legacy ? formatCents(legacy.totalFinalNetWorthCents) : careerLoading ? 'Loading...' : '-'} />
            </div>
            <p className="se-hint se-mt">
              Season records combine finished seasons. Current-season results are added after that season ends.
              {careerError ? ' Career history could not be loaded.' : ''}
            </p>
          </Panel>

          <Panel title="Next level reward" className="se-pass-panel se-xp-next">
            {nextReward ? (
              <>
                <div className={`se-xp-reward se-xp-reward--${nextReward.rarity}`}>
                  <span className="se-xp-reward__level">Level {formatNumber(nextReward.level)}</span>
                  <strong>{nextReward.title}</strong>
                  <small>{nextReward.rarity} title</small>
                </div>
                <div className="se-pass-progress se-xp-rewardbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rewardProgress} aria-label={`Progress to ${nextReward.title}`}>
                  <span style={{ width: `${rewardProgress}%` }} />
                </div>
                <div className="se-rows">
                  <Row label="Unlocks at" value={`Level ${formatNumber(nextReward.level)}`} />
                  <Row label="Lifetime XP needed" value={`${formatNumber(nextRewardXp ?? 0)} XP`} />
                </div>
                <p className="se-hint se-mt">When you reach this milestone, the title is added automatically. Equip it from <Link to="/account">Account settings</Link>.</p>
              </>
            ) : (
              <p className="se-muted">You have reached every listed XP title milestone. New account rewards will appear here when the track expands.</p>
            )}
          </Panel>
        </section>

        <section className="se-xp-claimed">
          <div>
            <span className="se-eyebrow">Unlocked rewards</span>
            <h2>Your title case</h2>
          </div>
          {claimedRewards.length > 0 ? (
            <div className="se-xp-claimed__list">
              {claimedRewards.map((reward) => (
                <span key={reward.key} className={`se-xp-chip se-xp-chip--${reward.rarity}`}>{reward.title}</span>
              ))}
            </div>
          ) : (
            <p className="se-hint">Reach level 5 to unlock your first permanent XP title.</p>
          )}
        </section>

        <section className="se-pass-trackwrap se-xp-history" aria-label="Career history">
          <div className="se-xp-sectionhead">
            <div>
              <h2>Career history</h2>
              <p className="se-hint">Your finished seasons, newest first. A season's record is added here when it ends.</p>
            </div>
          </div>
          {careerLoading && !career ? <p className="se-muted se-xp-loading">Loading finished seasons...</p> : null}
          {careerError && !career ? <p className="se-muted se-xp-loading">Career history is unavailable right now.</p> : null}
          {career && career.seasons.length === 0 ? <p className="se-muted se-xp-loading">You do not have a finished season yet. Your first season history will appear here when it ends.</p> : null}
          {career && career.seasons.length > 0 ? (
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>City</th>
                    <th className="se-table__number">National</th>
                    <th className="se-table__number">Local</th>
                    <th className="se-table__number">Final net worth</th>
                    <th className="se-table__number">Raids won</th>
                    <th className="se-table__number">Jobs completed</th>
                  </tr>
                </thead>
                <tbody>
                  {career.seasons.map((season) => (
                    <tr key={season.round.id}>
                      <td className="se-td--title" data-label="Season">
                        <strong>{season.round.name}</strong>
                        <br />
                        <time className="se-muted" dateTime={season.round.endedAt}>{formatWhen(season.round.endedAt)}</time>
                      </td>
                      <td data-label="City">{season.city.name}</td>
                      <td className="se-table__number se-num" data-label="National">
                        {season.rank.national === null ? '-' : `#${formatNumber(season.rank.national)}`}
                      </td>
                      <td className="se-table__number se-num" data-label="Local">
                        {season.rank.local === null ? '-' : `#${formatNumber(season.rank.local)}`}
                      </td>
                      <td className="se-table__number se-num" data-label="Final net worth">{formatCents(season.finalNetWorthCents)}</td>
                      <td className="se-table__number se-num" data-label="Raids won">{formatNumber(season.stats.raidAttackWins)}</td>
                      <td className="se-table__number se-num" data-label="Jobs completed">{formatNumber(season.stats.jobsCompleted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="se-pass-trackwrap se-xp-career" aria-label="Career milestones and cosmetic rewards">
          <div className="se-xp-sectionhead">
            <div>
              <h2>Career milestones</h2>
              <p className="se-hint">Milestones recognize your finished-season record. Each earned milestone also adds its permanent profile title and badge.</p>
            </div>
            <Link className="se-btn se-btn--secondary" to="/account">View cosmetics</Link>
          </div>
          {careerLoading && !career ? <p className="se-muted se-xp-loading">Loading your career record...</p> : null}
          {careerError && !career ? <p className="se-muted se-xp-loading">Career milestones are unavailable right now.</p> : null}
          <ul className="se-xp-milestones">
            {CAREER_MILESTONES.map((milestone) => {
              const current = Math.min(metricValue(career, milestone.metric), milestone.target);
              const unlocked = current >= milestone.target;
              return (
                <li className={`se-xp-milestone${unlocked ? ' se-xp-milestone--earned' : ''}`} key={milestone.key}>
                  <div className="se-xp-milestone__top">
                    <span className={`se-xp-milestone__rarity se-xp-milestone__rarity--${milestone.rarity}`}>{milestone.rarity}</span>
                    <span className="se-xp-milestone__status">{unlocked ? 'Earned' : 'In progress'}</span>
                  </div>
                  <h3>{milestone.title}</h3>
                  <p>{milestone.description}</p>
                  <div className="se-xp-milestone__reward">
                    <span aria-hidden="true">*</span>
                    <span>{milestone.reward}</span>
                  </div>
                  <div className="se-xp-milestone__progress" role="progressbar" aria-label={`${milestone.title} progress`} aria-valuemin={0} aria-valuemax={milestone.target} aria-valuenow={current}>
                    <span style={{ width: `${(current / milestone.target) * 100}%` }} />
                  </div>
                  <small>{formatNumber(current)} / {formatNumber(milestone.target)} {milestone.metric === 'roundsPlayed' ? 'seasons' : milestone.metric === 'topTenFinishes' ? 'top-ten finishes' : milestone.metric === 'podiumFinishes' ? 'podiums' : 'wins'}</small>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="se-pass-trackwrap se-xp-trackwrap" aria-label="Lifetime title unlock milestones">
          <div className="se-xp-trackhead">
            <div>
              <span className="se-eyebrow">Permanent rewards</span>
              <h2>Level reward track</h2>
            </div>
            <p className="se-hint">Titles unlock automatically and remain yours across seasons.</p>
          </div>
          <ol className="se-xp-track">
            {EXPERIENCE_LEVEL_REWARDS.map((reward) => {
              const unlocked = level >= reward.level;
              const isNext = nextReward?.level === reward.level;
              const requiredXp = experienceRequiredForLevel(reward.level);
              return (
                <li
                  key={reward.key}
                  className={`se-xp-card se-xp-card--${reward.rarity}${unlocked ? ' se-xp-card--unlocked' : ''}${isNext ? ' se-xp-card--next' : ''}`}
                  aria-label={`Level ${reward.level}: ${reward.title}, ${unlocked ? 'unlocked' : `requires ${formatNumber(requiredXp)} lifetime XP`}`}
                >
                  <div className="se-xp-card__top">
                    <span>Level {formatNumber(reward.level)}</span>
                    <strong>{unlocked ? 'Unlocked' : isNext ? 'Next' : `${formatNumber(requiredXp)} XP`}</strong>
                  </div>
                  <div className="se-xp-card__badge" aria-hidden="true">{unlocked ? 'OK' : '*'}</div>
                  <div>
                    <h3>{reward.title}</h3>
                    <p>{reward.description}</p>
                  </div>
                  <span className="se-xp-card__rarity">{reward.rarity} title</span>
                </li>
              );
            })}
          </ol>
        </section>

        <Panel title="XP activity log" className="se-xp-log">
          <p className="se-hint">Your 25 most recent XP awards across all seasons.</p>
          {experienceLoading && !xpEvents.length ? <p className="se-muted">Loading XP activity...</p> : null}
          {experienceError && !xpEvents.length ? <p className="se-muted">XP activity could not be loaded right now.</p> : null}
          {!experienceLoading && !experienceError && !xpEvents.length ? <p className="se-muted">No XP awards have been recorded yet. Earn XP through completed game actions and quests.</p> : null}
          {xpEvents.length > 0 ? (
            <ol className="se-xp-log__list">
              {xpEvents.map((event) => (
                <li className="se-xp-log__item" key={event.id}>
                  <div className="se-xp-log__copy">
                    <strong>{event.source}</strong>
                    <time dateTime={event.awardedAt}>{formatWhen(event.awardedAt)}</time>
                  </div>
                  <span className="se-xp-log__amount">+{formatNumber(event.amount)} XP</span>
                </li>
              ))}
            </ol>
          ) : null}
        </Panel>

        <p className="se-hint">Account XP and profile cosmetics persist between rounds. Street Cred and Street Pass tiers belong to one round and reset when that round ends.</p>
      </div>
    </GameLayout>
  );
}
