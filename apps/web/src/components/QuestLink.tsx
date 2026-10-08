import { Link } from 'react-router-dom';
import type { QuestLinkDto } from '@streets/shared';

/** 1.5.0-E2. The jobs page, opened on one quest's card. */
export function questHref(questKey: string): string {
  return `/game/quests?focus=${encodeURIComponent(questKey)}#quest-${encodeURIComponent(questKey)}`;
}

/** 1.5.0-E2. A link straight to the job behind a lock: "“Pack Your Bags” for Wheels". */
export function QuestLink({ quest }: { quest: QuestLinkDto }) {
  return (
    <>
      <Link className="se-golink" to={questHref(quest.key)}>“{quest.title}”</Link>
      {quest.giverName ? ` for ${quest.giverName}` : ''}
    </>
  );
}

/**
 * 1.5.0-E2. What every locked shelf says: the unlock, and the job that opens it. Falls back to
 * the jobs board when no single job grants it.
 */
export function QuestLockNote({ unlockName, quest, after }: { unlockName: string; quest: QuestLinkDto | null | undefined; after?: string }) {
  return (
    <p className="se-hint">
      {quest ? <>Finish <QuestLink quest={quest} /> to unlock {unlockName}.</> : <>Earn {unlockName} through <Link className="se-golink" to="/game/quests">underworld jobs</Link>.</>}
      {after ? ` ${after}` : ''}
    </p>
  );
}
