import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCents, formatNumber, type PlayerQuestDto } from '@streets/shared';
import { loadTrackedQuests, onQuestsChanged, peekTrackedQuests, trackedFromQuests } from '../quests/questSignals.js';

function primaryProgress(quest: PlayerQuestDto): string {
  const objective = quest.objectives.find((item) => !item.bonus && !item.completed)
    ?? quest.objectives.find((item) => !item.bonus);
  if (!objective) return quest.status === 'READY_TO_TURN_IN' ? 'Ready to collect' : '';
  if (objective.completed) return 'Complete';
  if (objective.kind === 'EARN_CASH') return formatCents(objective.current) + ' / ' + formatCents(objective.target);
  return formatNumber(objective.current) + ' / ' + formatNumber(objective.target);
}

export function TrackedQuests() {
  const [quests, setQuests] = useState<PlayerQuestDto[]>(peekTrackedQuests);

  const load = useCallback(() => {
    void loadTrackedQuests().then(setQuests);
  }, []);

  useEffect(() => {
    void load();
    return onQuestsChanged((detail) => {
      if (detail.tracked) {
        setQuests(detail.tracked);
        return;
      }
      if (detail.quests) {
        setQuests(trackedFromQuests(detail.quests));
        return;
      }
      void load();
    });
  }, [load]);

  if (!quests.length) return null;

  return (
    <div className="se-tracked-quests" aria-label="Tracked quests">
      <Link to="/game/quests?tab=active" className="se-tracked-quests__head">Tracked jobs</Link>
      <div className="se-tracked-quests__list">
        {quests.map((quest) => (
          <Link key={quest.key} to={{ pathname: '/game/quests', search: '?tab=active', hash: `#quest-${quest.key}` }} className={'se-tracked-quest' + (quest.status === 'READY_TO_TURN_IN' ? ' se-tracked-quest--ready' : '')}>
            <span className="se-tracked-quest__name">{quest.title}</span>
            <span className="se-tracked-quest__progress">
              {quest.status === 'READY_TO_TURN_IN' ? 'Collect' : primaryProgress(quest)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
