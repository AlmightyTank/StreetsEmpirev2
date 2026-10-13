import type { PlayerQuestDto } from '@streets/shared';

export type QuestBoardItem = Pick<PlayerQuestDto, 'key' | 'type' | 'category' | 'status' | 'isTracked'>;
export type QuestBoardGroupKey = 'story' | 'ready' | 'active' | 'available' | 'contracts' | 'history';

export interface QuestBoardGroup<T extends QuestBoardItem> {
  key: QuestBoardGroupKey;
  title: string;
  description: string;
  defaultOpen: boolean;
  quests: T[];
}

const GROUPS: ReadonlyArray<Omit<QuestBoardGroup<QuestBoardItem>, 'quests'>> = [
  { key: 'story', title: 'More story missions', description: 'Continue your criminal career.', defaultOpen: true },
  { key: 'ready', title: 'Ready to collect', description: 'Your finished jobs have rewards waiting.', defaultOpen: true },
  { key: 'active', title: 'Your active jobs', description: 'Track what you are working on now.', defaultOpen: true },
  { key: 'available', title: 'Available jobs', description: 'New jobs from your contacts.', defaultOpen: true },
  { key: 'contracts', title: 'Contracts & events', description: 'Daily, weekly, city, alliance, season and community jobs.', defaultOpen: false },
  { key: 'history', title: 'Completed & past jobs', description: 'Your history, expired jobs and past rewards.', defaultOpen: false },
];

const finished = (quest: QuestBoardItem) =>
  quest.status === 'COMPLETED' || quest.status === 'FAILED' || quest.status === 'EXPIRED';

const jobPriority = (quest: QuestBoardItem) =>
  quest.status === 'READY_TO_TURN_IN' ? 0 :
  quest.status === 'ACTIVE' && quest.isTracked ? 1 :
  quest.status === 'ACTIVE' ? 2 :
  quest.status === 'AVAILABLE' ? 3 :
  quest.status === 'LOCKED' ? 4 : 5;

/**
 * The story is always above all contracts. Never show every locked mission at
 * once; show the next gated story step when there is no playable one.
 * Preserve API order to respect authored chapter order when statuses tie.
 */
export function buildQuestBoard<T extends QuestBoardItem>(quests: readonly T[], focusKey: string | null = null): {
  featuredStory: T | null;
  groups: QuestBoardGroup<T>[];
} {
  const stories = quests.filter((quest) => quest.type === 'STORY' && !finished(quest));
  const playableStories = stories.filter((quest) => quest.status !== 'LOCKED');
  const featuredStory = [...(playableStories.length ? playableStories : stories)]
    .sort((left, right) => jobPriority(left) - jobPriority(right))[0] ?? null;

  const grouped = new Map<QuestBoardGroupKey, T[]>(GROUPS.map((group) => [group.key, []]));
  for (const quest of quests) {
    if (quest.key === featuredStory?.key) continue;
    if (finished(quest)) {
      grouped.get('history')!.push(quest);
      continue;
    }
    if (quest.status === 'LOCKED' && quest.key !== focusKey) continue;
    if (quest.type === 'STORY') {
      grouped.get('story')!.push(quest);
    } else if (quest.status === 'READY_TO_TURN_IN') {
      grouped.get('ready')!.push(quest);
    } else if (quest.status === 'ACTIVE') {
      grouped.get('active')!.push(quest);
    } else if (quest.type === 'DAILY' || quest.type === 'WEEKLY'
      || quest.type === 'CITY_CONTRACT' || quest.category === 'CITY_CONTRACT'
      || quest.type === 'ALLIANCE' || quest.type === 'SEASON' || quest.type === 'EVENT') {
      grouped.get('contracts')!.push(quest);
    } else {
      grouped.get('available')!.push(quest);
    }
  }

  return {
    featuredStory,
    groups: GROUPS.map((definition) => ({
      ...definition,
      quests: [...grouped.get(definition.key)!].sort((left, right) => jobPriority(left) - jobPriority(right)),
    })).filter((group) => group.quests.length > 0),
  };
}

/** Compatibility for bookmarks and old notification links containing ?tab=. */
export function legacyQuestGroup(search: string): QuestBoardGroupKey | null {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'completed') return 'history';
  if (tab === 'tracked') return 'active';
  if (tab === 'daily' || tab === 'weekly' || tab === 'city' || tab === 'season'
    || tab === 'alliance' || tab === 'events') return 'contracts';
  if (tab === 'ready' || tab === 'active' || tab === 'available') return tab;
  return null;
}
