import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceRequiredForLevel, formatCents, formatNumber, type PlayerExperienceDto, type PublicCareerDto } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { gameApi } from '../api/game.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

const LEVEL_REWARDS = [
  { level: 5, title: 'On the Rise', rarity: 'common' },
  { level: 10, title: 'Known Face', rarity: 'uncommon' },
  { level: 20, title: 'Street Veteran', rarity: 'rare' },
  { level: 30, title: 'City Fixture', rarity: 'epic' },
  { level: 50, title: 'Living Legend', rarity: 'legendary' },
] as const;

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
  const [experienceLoading, setExperienceLoading] = useState(true);
  const [careerLoading, setCareerLoading] = useState(true);
  const [experienceError, setExperienceError] = useState(false);
  const [careerError, setCareerError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadedExperience(null);
    setCareer(null);
    setExperienceError(false);
    setCareerError(false);
    setExperienceLoading(Boolean(accountId));
    setCareerLoading(Boolean(accountId));

    if (!accountId) {
      setExperienceLoading(false);
      setCareerLoading(false);
      return () => { active = false; };
    }

    void gameApi.experience()
      .then((response) => { if (active) setLoadedExperience(response.experience); })
      .catch(() => { if (active) setExperienceError(true); })
      .finally(() => { if (active) setExperienceLoading(false); });
    void communityApi.career()
      .then((response) => { if (active) setCareer(response.career); })
      .catch(() => { if (active) setCareerError(true); })
      .finally(() => { if (active) setCareerLoading(false); });

    return () => { active = false; };
  }, [accountId]);

  useEffect(() => {
    if (liveExperience) setLoadedExperience(liveExperience);
  }, [liveExperience]);

  const experience = loadedExperience ?? liveExperience;
  const level = experience?.level ?? 1;
  const totalXp = experience?.totalXp ?? 0;
  const nextLevel = level + 1;
  const nextLevelTotal = experienceRequiredForLevel(nextLevel);
  const nextLevelReward = LEVEL_REWARDS.find((reward) => reward.level > level) ?? null;
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
              <strong>{experienceLoading && !experience ? '…' : formatNumber(level)}</strong>
            </div>
            <div className="se-pass-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={experience?.progressPercent ?? 0} aria-label={experience ? `Progress to level ${nextLevel}` : 'Lifetime XP progress'}>
              <span style={{ width: `${experience?.progressPercent ?? 0}%` }} />
            </div>
            <small>
              {experienceLoading && !experience
                ? 'Loading lifetime XP…'
                : experience
                  ? `${formatNumber(experience.xpIntoLevel)} / ${formatNumber(experience.xpForLevel)} XP · ${formatNumber(experience.xpToNextLevel)} to level ${formatNumber(nextLevel)}`
                  : 'Lifetime XP is not available right now.'}
            </small>
          </div>
        </header>

        <section className="se-pass-info">
          <Panel title="Lifetime stats" className="se-pass-panel">
            {experienceError && !experience ? <p className="se-muted">Could not load your lifetime XP right now.</p> : null}
            <div className="se-xp-lifetime-grid">
              <Stat label="Lifetime XP" value={experience ? formatNumber(totalXp) : experienceLoading ? 'Loading…' : '—'} />
              <Stat label="Finished seasons" value={legacy ? formatNumber(legacy.roundsPlayed) : careerLoading ? 'Loading…' : '—'} />
              <Stat label="Season wins" value={legacy ? formatNumber(legacy.roundWins) : careerLoading ? 'Loading…' : '—'} />
              <Stat label="National top 10s" value={legacy ? formatNumber(legacy.topTenFinishes) : careerLoading ? 'Loading…' : '—'} />
              <Stat label="National podiums" value={legacy ? formatNumber(legacy.podiumFinishes) : careerLoading ? 'Loading…' : '—'} />
              <Stat label="Best national rank" value={legacy?.bestNationalRank ? `#${formatNumber(legacy.bestNationalRank)}` : legacy ? '—' : careerLoading ? 'Loading…' : '—'} />
              <Stat label="Raid wins" value={career ? formatNumber(lifetimeRaidWins) : careerLoading ? 'Loading…' : '—'} />
              <Stat label="Jobs completed" value={career ? formatNumber(lifetimeJobs) : careerLoading ? 'Loading…' : '—'} />
              <Stat label="Recon runs" value={career ? formatNumber(lifetimeRecon) : careerLoading ? 'Loading…' : '—'} />
              <Stat label="Combined season-end net worth" value={legacy ? formatCents(legacy.totalFinalNetWorthCents) : careerLoading ? 'Loading…' : '—'} />
            </div>
            <p className="se-hint se-mt">
              Season records combine finished seasons. Current-season results are added after that season ends.
              {careerError ? ' Career history could not be loaded.' : ''}
            </p>
          </Panel>

          <Panel title="Next level reward" className="se-pass-panel">
            {nextLevelReward ? (
              <>
                <div className="se-rows">
                  <Row label="Reward" value={nextLevelReward.title} strong />
                  <Row label="Unlocks at" value={`Level ${formatNumber(nextLevelReward.level)}`} />
                  <Row label="Reward type" value="Permanent profile title" />
                </div>
                <p className="se-hint se-mt">Titles unlock automatically and remain yours across seasons. Equip a title from <Link to="/account">Account settings</Link>.</p>
              </>
            ) : (
              <p className="se-muted">You have reached every listed level-title milestone.</p>
            )}
          </Panel>
        </section>

        <section className="se-pass-trackwrap se-xp-career" aria-label="Career milestones and cosmetic rewards">
          <div className="se-xp-sectionhead">
            <div>
              <h2>Career milestones</h2>
              <p className="se-hint">Milestones recognize your finished-season record. Each earned milestone also adds its permanent profile title and badge.</p>
            </div>
            <Link className="se-btn se-btn--secondary" to="/account">View cosmetics</Link>
          </div>
          {careerLoading && !career ? <p className="se-muted se-xp-loading">Loading your career record…</p> : null}
          {careerError && !career ? <p className="se-muted se-xp-loading">Career milestones are unavailable right now.</p> : null}
          <ul className="se-xp-milestones">
            {CAREER_MILESTONES.map((milestone) => {
              const current = Math.min(metricValue(career, milestone.metric), milestone.target);
              const unlocked = current >= milestone.target;
              return (
                <li className={`se-xp-milestone${unlocked ? ' se-xp-milestone--earned' : ''}`} key={milestone.key}>
                  <div className="se-xp-milestone__top">
                    <span className={`se-xp-milestone__rarity se-xp-milestone__rarity--${milestone.rarity}`}>{milestone.rarity}</span>
                    <span className="se-xp-milestone__status">{unlocked ? '✓ Earned' : 'In progress'}</span>
                  </div>
                  <h3>{milestone.title}</h3>
                  <p>{milestone.description}</p>
                  <div className="se-xp-milestone__reward">
                    <span aria-hidden="true">✦</span>
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

        <section className="se-pass-trackwrap" aria-label="Lifetime level title rewards">
          <h2>Level title rewards</h2>
          <p className="se-hint">These profile titles are permanent account cosmetics. They do not change gameplay.</p>
          <ol className="se-pass-track">
            {LEVEL_REWARDS.map((reward) => {
              const unlocked = level >= reward.level;
              const total = experienceRequiredForLevel(reward.level);
              return (
                <li
                  key={reward.level}
                  className={`se-pass-tier se-pass-tier--${unlocked ? 'claimed' : 'locked'}`}
                  data-tier={reward.level}
                  aria-label={`Level ${reward.level}: ${reward.title}, ${unlocked ? 'unlocked' : `requires ${formatNumber(total)} lifetime XP`}`}
                >
                  <span className="se-pass-tier__number">{reward.level}</span>
                  <div className="se-pass-tier__rewards">
                    <figure className="se-pass-cosmetic" title={`${reward.rarity} title`}>
                      <span aria-hidden="true">{unlocked ? '✓' : '★'}</span>
                      <figcaption>{reward.title}</figcaption>
                    </figure>
                  </div>
                  <div className="se-pass-tier__foot">
                    {unlocked
                      ? <span className="se-pass-tier__done">✓ Unlocked</span>
                      : <span className="se-pass-tier__cred">{formatNumber(total)} XP</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <p className="se-hint">Account XP and profile cosmetics persist between rounds. Street Cred and Street Pass tiers belong to one round and reset when that round ends.</p>
      </div>
    </GameLayout>
  );
}
