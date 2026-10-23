import type { PlayerQuestDto } from '@streets/shared';
import { questsApi } from '../api/quests.js';

export const QUESTS_CHANGED_EVENT = 'streets:quests-changed';

/** `board` is a desk edit (accept, track, abandon, favor). `action` can open recipes and cases. */
export type QuestChangeScope = 'board' | 'action';

export interface QuestsChangedDetail {
  scope: QuestChangeScope;
  /** Present when the caller already has the board, so listeners skip another fetch. */
  quests?: PlayerQuestDto[];
  tracked?: PlayerQuestDto[];
}

export function trackedFromQuests(quests: PlayerQuestDto[]): PlayerQuestDto[] {
  return quests.filter((quest) => quest.isTracked && (quest.status === 'ACTIVE' || quest.status === 'READY_TO_TURN_IN'));
}

let cachedTracked: PlayerQuestDto[] = [];
let generation = 0;
let pendingLoad: Promise<PlayerQuestDto[]> | null = null;
let pendingDetail: QuestsChangedDetail | null = null;
let queued = false;

function mergeDetail(current: QuestsChangedDetail | null, next: QuestsChangedDetail): QuestsChangedDetail {
  if (!current) return next;
  return {
    scope: current.scope === 'action' || next.scope === 'action' ? 'action' : 'board',
    quests: next.quests ?? current.quests,
    tracked: next.tracked ?? current.tracked,
  };
}

export function rememberTrackedQuests(quests: PlayerQuestDto[]): void {
  generation += 1;
  cachedTracked = quests;
}

export function peekTrackedQuests(): PlayerQuestDto[] {
  return cachedTracked;
}

/** One click can publish more than once. Listeners hear a single event on the next microtask. */
export function publishQuestsChanged(detail: QuestsChangedDetail): void {
  pendingDetail = mergeDetail(pendingDetail, detail);
  if (detail.tracked) rememberTrackedQuests(detail.tracked);
  else if (detail.quests) rememberTrackedQuests(trackedFromQuests(detail.quests));
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    const next = pendingDetail;
    pendingDetail = null;
    if (!next) return;
    window.dispatchEvent(new CustomEvent<QuestsChangedDetail>(QUESTS_CHANGED_EVENT, { detail: next }));
  });
}

export function onQuestsChanged(listener: (detail: QuestsChangedDetail) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<QuestsChangedDetail>).detail;
    listener(detail ?? { scope: 'action' });
  };
  window.addEventListener(QUESTS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(QUESTS_CHANGED_EVENT, handler);
}

/** Cheap tracked-jobs read. A newer board response wins if it lands first. */
export function loadTrackedQuests(): Promise<PlayerQuestDto[]> {
  if (!pendingLoad) {
    const started = generation;
    pendingLoad = questsApi.tracked()
      .then((page) => {
        if (started === generation) cachedTracked = page.quests;
        return cachedTracked;
      })
      .catch(() => cachedTracked)
      .finally(() => {
        pendingLoad = null;
      });
  }
  return pendingLoad;
}
