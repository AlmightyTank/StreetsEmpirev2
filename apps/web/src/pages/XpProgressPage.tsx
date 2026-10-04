import { Link } from 'react-router-dom';
import { experienceRequiredForLevel, formatNumber } from '@streets/shared';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

const MILESTONES = [
  { level: 5, title: 'On the Rise', rarity: 'common' },
  { level: 10, title: 'Known Face', rarity: 'uncommon' },
  { level: 20, title: 'Street Veteran', rarity: 'rare' },
  { level: 30, title: 'City Fixture', rarity: 'epic' },
  { level: 50, title: 'Living Legend', rarity: 'legendary' },
] as const;

export function XpProgressPage() {
  const experience = useSession((state) => state.me?.experience ?? null);

  if (!experience) {
    return (
      <GameLayout>
        <div className="se-pass">
          <header className="se-pass-hero">
            <div className="se-pass-hero__copy">
              <span className="se-eyebrow">Account progression · carries between seasons</span>
              <h1>XP Progress</h1>
              <p>Your lifetime XP and title unlocks will appear here once you join a season.</p>
            </div>
          </header>
          <Panel title="Your progress is waiting">
            <p className="se-muted">Join a season to start earning XP. Your level stays with your account when a season ends.</p>
            <Link className="se-btn se-btn--primary" to="/join">Join a season</Link>
          </Panel>
        </div>
      </GameLayout>
    );
  }

  const nextLevel = experience.level + 1;
  const nextLevelTotal = experienceRequiredForLevel(nextLevel);
  const nextMilestone = MILESTONES.find((milestone) => milestone.level > experience.level) ?? null;

  return (
    <GameLayout>
      <div className="se-pass se-xp-progress">
        <header className="se-pass-hero">
          <div className="se-pass-hero__copy">
            <span className="se-eyebrow">Lifetime account progression · never resets</span>
            <h1>XP Progress</h1>
            <p>Every action that earns XP moves your account forward. Level rewards are profile titles and cosmetics, with no gameplay bonuses.</p>
          </div>
          <div className="se-pass-hero__progress">
            <div>
              <span>Current level</span>
              <strong>{formatNumber(experience.level)}</strong>
            </div>
            <div className="se-pass-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={experience.progressPercent} aria-label={`Progress to level ${nextLevel}`}>
              <span style={{ width: `${experience.progressPercent}%` }} />
            </div>
            <small>{formatNumber(experience.xpIntoLevel)} / {formatNumber(experience.xpForLevel)} XP · {formatNumber(experience.xpToNextLevel)} to level {formatNumber(nextLevel)}</small>
          </div>
        </header>

        <div className="se-pass-info">
          <Panel title="Lifetime XP" className="se-pass-panel">
            <div className="se-rows">
              <Row label="Total earned" value={`${formatNumber(experience.totalXp)} XP`} strong />
              <Row label="Current level" value={formatNumber(experience.level)} />
              <Row label={`Level ${formatNumber(nextLevel)} begins at`} value={`${formatNumber(nextLevelTotal)} XP`} />
            </div>
          </Panel>
          <Panel title="Next title unlock" className="se-pass-panel">
            {nextMilestone ? (
              <>
                <div className="se-rows">
                  <Row label="Reward" value={nextMilestone.title} strong />
                  <Row label="Unlocks at" value={`Level ${formatNumber(nextMilestone.level)}`} />
                  <Row label="Current level" value={formatNumber(experience.level)} />
                </div>
                <p className="se-hint se-mt">When you reach the milestone, the title is added to your account automatically. Equip it from <Link to="/account">Account settings</Link>.</p>
              </>
            ) : (
              <p className="se-muted">You have reached every currently listed title milestone. More rewards can be added to the track later.</p>
            )}
          </Panel>
        </div>

        <section className="se-pass-trackwrap" aria-label="Lifetime title unlock milestones">
          <h2>Title unlock track</h2>
          <p className="se-hint">Titles unlock automatically at these levels and remain yours across seasons.</p>
          <ol className="se-pass-track">
            {MILESTONES.map((milestone) => {
              const unlocked = experience.level >= milestone.level;
              const totalXp = experienceRequiredForLevel(milestone.level);
              return (
                <li
                  key={milestone.level}
                  className={`se-pass-tier se-pass-tier--${unlocked ? 'claimed' : 'locked'}`}
                  data-tier={milestone.level}
                  aria-label={`Level ${milestone.level}: ${milestone.title}, ${unlocked ? 'unlocked' : `requires ${formatNumber(totalXp)} lifetime XP`}`}
                >
                  <span className="se-pass-tier__number">{milestone.level}</span>
                  <div className="se-pass-tier__rewards">
                    <figure className="se-pass-cosmetic" title={`${milestone.rarity} title`}>
                      <span aria-hidden="true">{unlocked ? '✓' : '★'}</span>
                      <figcaption>{milestone.title}</figcaption>
                    </figure>
                  </div>
                  <div className="se-pass-tier__foot">
                    {unlocked
                      ? <span className="se-pass-tier__done">✓ Unlocked</span>
                      : <span className="se-pass-tier__cred">{formatNumber(totalXp)} XP</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <p className="se-hint">XP belongs to your account and continues across rounds. Street Cred and Street Pass tiers belong to a single round and reset when that round ends.</p>
      </div>
    </GameLayout>
  );
}
