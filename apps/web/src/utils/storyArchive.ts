import type { PlayerQuestDto, PlayerQuestStatusDto } from '@streets/shared';

export interface StoryArchiveEntry {
  key: string;
  title: string;
  status: PlayerQuestStatusDto;
  speaker: string;
  /** The closing line once the chapter is done, else null. */
  closing: string | null;
  answers: Array<{ scene: string; label: string; outcome: string }>;
  /** The turn-in choice, by its title, once made. */
  choice: string | null;
}

export interface StoryArchiveSection {
  chapter: string;
  arc: 'MAIN' | 'SIDE';
  entries: StoryArchiveEntry[];
}

export interface StoryArchive {
  sections: StoryArchiveSection[];
  completed: number;
  total: number;
  /** How the player closed the book, once the finale is done. */
  ending: { key: string; title: string; closing: string | null } | null;
}

const FINALE = 'ML_M25_MISSING_LINE';

/**
 * Story campaign Slice J. The Missing Line as the player has lived it, from the job page and the
 * job history (a finished chapter appears in the history, so it wins over the page's copy). Main
 * chapters come first, then side arcs, each grouped under its act or arc label. Locked chapters
 * count toward the total but are not listed.
 */
export function buildStoryArchive(...lists: PlayerQuestDto[][]): StoryArchive {
  const byKey = new Map<string, PlayerQuestDto>();
  for (const quest of lists.flat()) {
    if (!quest.key.startsWith('ML_')) continue;
    const seen = byKey.get(quest.key);
    if (!seen || (seen.status !== 'COMPLETED' && quest.status === 'COMPLETED')) byKey.set(quest.key, quest);
  }
  const quests = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));

  const sections: StoryArchiveSection[] = [];
  for (const quest of quests) {
    // Chapters still locked stay unread: their titles would spoil what comes next.
    if (quest.status === 'LOCKED') continue;
    const chapter = quest.story?.chapter ?? 'The Missing Line';
    const arc = quest.key.startsWith('ML_S') ? 'SIDE' : 'MAIN';
    let section = sections.find((candidate) => candidate.chapter === chapter && candidate.arc === arc);
    if (!section) sections.push(section = { chapter, arc, entries: [] });
    section.entries.push(entry(quest));
  }
  sections.sort((a, b) => (a.arc === b.arc ? 0 : a.arc === 'MAIN' ? -1 : 1));

  const finale = byKey.get(FINALE);
  const endingTitle = finale?.chosenBranch
    ? finale.branchChoices.find((choice) => choice.key === finale.chosenBranch)?.title ?? finale.chosenBranch
    : null;
  return {
    sections,
    completed: quests.filter((quest) => quest.status === 'COMPLETED').length,
    total: quests.length,
    ending: finale?.status === 'COMPLETED' && finale.chosenBranch && endingTitle
      ? { key: finale.chosenBranch, title: endingTitle, closing: finale.story?.completed ?? null }
      : null,
  };
}

function entry(quest: PlayerQuestDto): StoryArchiveEntry {
  const done = quest.status === 'COMPLETED';
  return {
    key: quest.key,
    title: quest.title,
    status: quest.status,
    speaker: quest.story?.speaker ?? quest.contactName ?? '',
    closing: done ? quest.story?.completed ?? null : null,
    answers: (quest.story?.scenes ?? []).flatMap((scene) => scene.response
      ? [{ scene: scene.title, label: scene.response.label, outcome: scene.response.outcome }]
      : []),
    choice: quest.chosenBranch
      ? quest.branchChoices.find((choice) => choice.key === quest.chosenBranch)?.title ?? quest.chosenBranch
      : null,
  };
}
