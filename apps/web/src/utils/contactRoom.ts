import type { PlayerQuestDto, QuestContactDto, QuestStorySceneDto } from '@streets/shared';

/**
 * The contact room: a visit with one contact, played as a dialogue. Pure helpers here; the page
 * renders them and sends the same accept / scene / claim requests as the quest board.
 */

export type ContactRoomView =
  | { kind: 'hub' }
  | { kind: 'work' }
  | { kind: 'job'; questKey: string }
  | { kind: 'standing' };

/** Link to a contact's room. */
export function contactRoomHref(contactKey: string): string {
  return `/game/visit/${encodeURIComponent(contactKey.toLowerCase())}`;
}

/** What each contact says when the player walks in. Falls back to the contact's description. */
const GREETINGS: Readonly<Record<string, string>> = {
  MAMA_KING: 'Sit down. Kettle’s on, and so is the street.',
  PIP: 'Buying, selling, or just here to look at my scale?',
  TOMMY: 'Hands where I can see them. I’m joking. Mostly.',
  WHEELS: 'Make it quick. The engine’s still warm.',
  VIC: 'Everybody needs a favor eventually. What’s yours?',
  BLOCKS: 'Every corner in this city has an owner. Which one are we talking about?',
  LEDGER: 'Sit. Don’t touch the files.',
  ACE: 'Table minimums are posted. Everything else is negotiable.',
  COMMISSIONER: 'Make it brief. I am not your friend.',
};

/** Contacts who also keep a counter, and where it is. */
const STORES: Readonly<Record<string, string>> = { PIP: 'pip', TOMMY: 'tommy' };

export function greetingFor(contact: Pick<QuestContactDto, 'key' | 'description'>): string {
  return GREETINGS[contact.key] ?? contact.description;
}

export function storeSlugFor(contactKey: string): string | null {
  return STORES[contactKey] ?? null;
}

const OPEN = new Set<PlayerQuestDto['status']>(['READY_TO_TURN_IN', 'ACTIVE', 'AVAILABLE']);
const ORDER: Record<string, number> = { READY_TO_TURN_IN: 0, ACTIVE: 1, AVAILABLE: 2 };

/** The work a contact can talk about right now: ready first, then active, then on offer; the campaign leads each group. */
export function contactJobs(quests: readonly PlayerQuestDto[], contactKey: string): PlayerQuestDto[] {
  return quests
    .filter((quest) => quest.contactKey === contactKey && OPEN.has(quest.status))
    .map((quest, index) => ({ quest, index }))
    .sort((left, right) => (ORDER[left.quest.status]! - ORDER[right.quest.status]!)
      || (Number(right.quest.category === 'CAMPAIGN') - Number(left.quest.category === 'CAMPAIGN'))
      || (left.index - right.index))
    .map(({ quest }) => quest);
}

/** Jobs from this contact that are still locked behind earlier work. */
export function lockedJobCount(quests: readonly PlayerQuestDto[], contactKey: string): number {
  return quests.filter((quest) => quest.contactKey === contactKey && quest.status === 'LOCKED').length;
}

/** The scene a job is waiting on, if one can be played now. */
export function openScene(quest: PlayerQuestDto): QuestStorySceneDto | null {
  return quest.story?.scenes?.find((scene) => scene.available) ?? null;
}

/** What the contact says about a job, given where it stands. */
export function jobLine(quest: PlayerQuestDto): string {
  const scene = openScene(quest);
  if (scene) return scene.prose;
  const story = quest.story;
  if (!story) return quest.description;
  switch (quest.status) {
    case 'AVAILABLE': return `${story.intro}\n\n${quest.description}`;
    case 'READY_TO_TURN_IN': return story.ready;
    case 'COMPLETED': return story.completed;
    default: return story.inProgress;
  }
}

export function jobStatusLabel(quest: PlayerQuestDto): string {
  switch (quest.status) {
    case 'READY_TO_TURN_IN': return 'Ready to collect';
    case 'ACTIVE': return openScene(quest) ? 'Your move' : 'In progress';
    case 'AVAILABLE': return 'On offer';
    default: return quest.status.replace(/_/g, ' ').toLowerCase();
  }
}

/** One line of the visit transcript: a past job and the choices made in it. */
export interface ContactHistoryEntry {
  key: string;
  title: string;
  closing: string;
  choices: { scene: string; choice: string }[];
}

export function contactHistory(quests: readonly PlayerQuestDto[], contactKey: string): ContactHistoryEntry[] {
  return quests
    .filter((quest) => quest.contactKey === contactKey && quest.status === 'COMPLETED')
    .map((quest) => ({
      key: quest.key,
      title: quest.title,
      closing: quest.story?.completed ?? quest.description,
      choices: (quest.story?.scenes ?? []).flatMap((scene) => scene.response ? [{ scene: scene.title, choice: scene.response.label }] : []),
    }));
}
