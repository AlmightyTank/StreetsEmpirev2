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
  MARA_VENN: 'Sit. Nobody here is armed. That’s the point.',
};

/** Contacts who also keep a counter, and where it is. */
const STORES: Readonly<Record<string, string>> = { PIP: 'pip', TOMMY: 'tommy' };

export function greetingFor(contact: Pick<QuestContactDto, 'key' | 'description'>): string {
  return GREETINGS[contact.key] ?? contact.description;
}

export function storeSlugFor(contactKey: string): string | null {
  return STORES[contactKey] ?? null;
}

/** True when a store's keeper is a contact with a room to visit. */
export function storeHasContactRoom(storeKey: string): boolean {
  return Object.hasOwn(STORES, storeKey);
}

/** Where a contact is when you talk to them: a painted room and its name. */
export interface RoomSetting {
  name: string;
  /** Path of the painted backdrop under `public/`. */
  art: string;
}

/** Each contact's own room, where they are when no job takes them elsewhere. */
const HOME_ROOMS: Readonly<Record<string, RoomSetting>> = {
  MAMA_KING: { name: 'Mama’s kitchen', art: '/rooms/mama-king.svg' },
  PIP: { name: 'Pip’s counter', art: '/rooms/pip.svg' },
  TOMMY: { name: 'Tommy’s back room', art: '/rooms/tommy.svg' },
  WHEELS: { name: 'The garage', art: '/rooms/wheels.svg' },
  VIC: { name: 'Vic’s booth', art: '/rooms/vic.svg' },
  BLOCKS: { name: 'The corner', art: '/rooms/blocks.svg' },
  LEDGER: { name: 'Ledger’s desk', art: '/rooms/ledger.svg' },
  ACE: { name: 'The casino floor', art: '/rooms/ace.svg' },
  COMMISSIONER: { name: 'The Commissioner’s office', art: '/rooms/commissioner.svg' },
  MARA_VENN: { name: 'The Clearinghouse', art: '/rooms/mara-venn.svg' },
};

/** Places the story goes. A chapter set in one shows it whenever that job is being talked about. */
export const PLACES = {
  PORCH_RAIN: { name: 'Mama’s porch, in the rain', art: '/rooms/places/porch-rain.svg' },
  CORNER_SHOP: { name: 'Mrs. Alvarez’s shop', art: '/rooms/places/corner-shop.svg' },
  RECORDS_ROOM: { name: 'The precinct records room', art: '/rooms/places/records-room.svg' },
  STAIRWELL: { name: 'Mr. Hales’s stairwell', art: '/rooms/places/stairwell.svg' },
  OLD_DROP: { name: 'The old drop, Urban Ghetto', art: '/rooms/places/old-drop.svg' },
  NORTH_ROAD: { name: 'The north road', art: '/rooms/places/north-road.svg' },
  BUS_DEPOT: { name: 'The bus depot', art: '/rooms/places/bus-depot.svg' },
  GAS_STATION: { name: 'A gas station off the highway', art: '/rooms/places/gas-station.svg' },
  SUPPLIER_WAREHOUSE: { name: 'The supplier’s warehouse', art: '/rooms/places/supplier-warehouse.svg' },
  LONG_TABLE: { name: 'Every chair out', art: '/rooms/places/long-table.svg' },
  HOSPITAL: { name: 'The hospital, at shift change', art: '/rooms/places/hospital-corridor.svg' },
} as const satisfies Record<string, RoomSetting>;

/** The Missing Line chapters that happen somewhere other than the contact's own room. */
export const JOB_PLACES: Readonly<Record<string, keyof typeof PLACES>> = {
  ML_M01_NIGHT_RECEIPT: 'PORCH_RAIN',
  ML_M02_SMALL_FAVOR: 'CORNER_SHOP',
  ML_M05_MISSING_LINE: 'RECORDS_ROOM',
  ML_M07_NORTH_ROAD: 'NORTH_ROAD',
  ML_M11_TERMS_OF_QUIET: 'OLD_DROP',
  ML_M12_CLERK_ON_THE_STAIRS: 'STAIRWELL',
  ML_M14_WOMAN_AT_CLOSING: 'CORNER_SHOP',
  ML_M15_NAME_IN_THE_MARGIN: 'RECORDS_ROOM',
  ML_M16_MILE_MARKER_NINE: 'NORTH_ROAD',
  ML_M17_PASSENGER_NINE: 'BUS_DEPOT',
  ML_M22_NO_ONE_OWES_ALONE: 'LONG_TABLE',
  ML_M24_EVERYBODY_AT_THE_TABLE: 'LONG_TABLE',
  ML_M25_MISSING_LINE: 'PORCH_RAIN',
  ML_S01_KEY_UNDER_MAT: 'CORNER_SHOP',
  ML_S02_RENT_ENVELOPE: 'CORNER_SHOP',
  ML_S04_WEIGHT_ON_THE_SCALE: 'SUPPLIER_WAREHOUSE',
  ML_S05_BOX_WITH_NO_LABEL: 'SUPPLIER_WAREHOUSE',
  ML_S06_LAST_HONEST_COUNT: 'SUPPLIER_WAREHOUSE',
  ML_S10_MILE_MARKER_ZERO: 'NORTH_ROAD',
  ML_S11_PASSENGER_WINDOW: 'BUS_DEPOT',
  ML_S12_EVERY_ROAD_HOME: 'GAS_STATION',
  ML_S13_COPY_FOR_LEDGER: 'HOSPITAL',
  ML_S15_PLAIN_ENGLISH: 'LONG_TABLE',
};

function jobPlace(questKey: string): RoomSetting | null {
  const place = JOB_PLACES[questKey];
  return place ? PLACES[place] : null;
}

/**
 * Where the contact is for this part of the visit. Talking about a job set somewhere shows that
 * place. Otherwise, a contact in the middle of such a job (taken, or ready to turn in) is still
 * out there; if not, they are in their own room. Null when the contact has no room art.
 */
export function roomSetting(quests: readonly PlayerQuestDto[], contactKey: string, view: ContactRoomView): RoomSetting | null {
  const home = HOME_ROOMS[contactKey] ?? null;
  if (view.kind === 'job') return jobPlace(view.questKey) ?? home;
  const underway = contactJobs(quests, contactKey)
    .find((quest) => (quest.status === 'ACTIVE' || quest.status === 'READY_TO_TURN_IN') && jobPlace(quest.key));
  return (underway && jobPlace(underway.key)) ?? home;
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
