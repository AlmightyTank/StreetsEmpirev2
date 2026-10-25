import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlayerQuestDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { loadTrackedQuests, onQuestsChanged } from '../quests/questSignals.js';
import { buildQuestBoard } from '../utils/questBoard.js';
import { NavIcon } from './NavIcon.js';

function primaryObjective(quest: PlayerQuestDto) {
  return quest.objectives.find((objective) => !objective.bonus && !objective.completed)
    ?? quest.objectives.find((objective) => !objective.bonus);
}

/**
 * Lightweight, read-only preview using the same story-first ordering as Quests.
 * Reload on quest changes; never run quest mutations from the Dashboard.
 */
export function DashboardStorySpotlight() {
  const [quests, setQuests] = useState<PlayerQuestDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    let active = true;
    let sequence = 0;
    const refresh = () => {
      const call = ++sequence;
      void loadTrackedQuests().then((tracked) => {
        if (!active || call !== sequence) return;
        setQuests(tracked);
        setFailed(false);
      }).catch(() => {
        if (active && call === sequence) setFailed(true);
      });
    };
    refresh();
    cleanups.push(onQuestsChanged((detail) => {
      if (detail.quests) {
        if (!active) return;
        setQuests(detail.quests);
        setFailed(false);
        return;
      }
      if (detail.scope === 'board') return;
      refresh();
    }));
    return () => { active = false; for (const cleanup of cleanups) cleanup(); };
  }, []);

  const featured = quests ? buildQuestBoard(quests).featuredStory : null;
  const readyCount = quests?.filter((quest) => quest.status === 'READY_TO_TURN_IN').length ?? 0;
  const objective = featured ? primaryObjective(featured) : null;
  const progress = objective && objective.target > 0
    ? Math.max(0, Math.min(100, Math.round((objective.current / objective.target) * 100)))
    : null;

  const questUrl = featured
    ? `/game/quests?view=jobs&focus=${encodeURIComponent(featured.key)}#quest-${encodeURIComponent(featured.key)}`
    : '/game/quests';

  return (
    <section className="se-dashboard-story" aria-labelledby="dashboard-story-title">
      <div className="se-dashboard-story__head">
        <div>
          <span className="se-eyebrow">Pick up where you left off</span>
          <h2 id="dashboard-story-title"><span className="se-dashboard-story__glyph" aria-hidden="true"><NavIcon name="rules" /></span> Main story</h2>
        </div>
        {readyCount > 0 ? <Link className="se-dashboard-story__ready" to="/game/quests?view=jobs">{formatNumber(readyCount)} ready to collect</Link> : null}
      </div>
      {featured ? (
        <>
          <div className="se-dashboard-story__meta">
            <span>{featured.story?.chapter ?? 'Story mission'}</span>
            <span>{featured.status === 'READY_TO_TURN_IN' ? 'Reward ready' : featured.status === 'LOCKED' ? 'Next unlock' : featured.status === 'ACTIVE' ? 'In progress' : 'Available'}</span>
          </div>
          <h3>{featured.title}</h3>
          <p>{featured.description}</p>
          {objective ? (
            <div className="se-dashboard-story__objective">
              <div className="se-dashboard-story__progresshead">
                <span>{objective.description}</span>
                <strong>{objective.kind === 'EARN_CASH' ? `${formatCents(objective.current)} / ${formatCents(objective.target)}` : `${formatNumber(objective.current)} / ${formatNumber(objective.target)}`}</strong>
              </div>
              {progress !== null ? <div className="se-dashboard-story__meter" role="progressbar" aria-label={objective.description}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <span style={{ width: `${progress}%` }} />
              </div> : null}
            </div>
          ) : null}
          {featured.status === 'LOCKED' && featured.requires?.length ? (
            <p className="se-dashboard-story__lock">Complete the required earlier jobs to unlock this mission.</p>
          ) : null}
          <div className="se-dashboard-story__footer">
            <Link className="se-btn se-btn--primary" to={questUrl}>
              {featured.status === 'READY_TO_TURN_IN' ? 'Collect story reward' : featured.status === 'LOCKED' ? 'View requirements' : featured.status === 'ACTIVE' ? 'Continue story' : 'Start mission'}
            </Link>
            <Link className="se-dashboard-story__all" to="/game/quests">All quests →</Link>
          </div>
        </>
      ) : (
        <div className="se-dashboard-story__fallback">
          <p>{!quests && !failed ? 'Checking your next chapter…' : failed ? 'Your story is still available through your contacts.' : 'Your current story is complete. Call someone else and find more work.'}</p>
          <Link className="se-btn se-btn--primary" to="/game/quests">Open contacts</Link>
        </div>
      )}
    </section>
  );
}
