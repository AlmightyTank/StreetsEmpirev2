import type { ContactCatalog, ContactKey, QuestDefinition, QuestDefinitionCatalog, QuestType } from '../types.js';

const CONTACT_BY_CATEGORY: Record<string, ContactKey> = {
  STREET: 'MAMA_KING',
  PRODUCT: 'PIP',
  ECONOMY: 'PIP',
  BUSINESS: 'PIP',
  COMBAT: 'TOMMY',
  TRAVEL: 'WHEELS',
  CONVOY: 'WHEELS',
  BOSS_TRIP: 'WHEELS',
  TURF: 'BLOCKS',
  BLOCK_WAR: 'BLOCKS',
  HEAT: 'VIC',
  LAW: 'VIC',
  CASINO: 'VIC',
  CITY_CONTRACT: 'VIC',
  COMMUNITY: 'MAMA_KING',
  HALLOWEEN: 'VIC',
  CHRISTMAS: 'WHEELS',
  DANGEROUS: 'VIC',
  DETECTIVE: 'VIC',
  COMEDY: 'MAMA_KING',
  LOST_ADVENTURE: 'WHEELS',
  BLACKWOOD: 'VIC',
  SCI_FI: 'VIC',
  SHADOW_CITY: 'VIC',
  FORGOTTEN_GUILD: 'VIC',
  LEGENDARY_CROSSOVER: 'VIC',
};

const CONTACT_BY_TYPE: Record<QuestType, ContactKey> = {
  STORY: 'MAMA_KING',
  SIDE: 'MAMA_KING',
  DAILY: 'MAMA_KING',
  WEEKLY: 'MAMA_KING',
  SECRET: 'VIC',
  CITY_CONTRACT: 'VIC',
  ALLIANCE: 'BLOCKS',
  EVENT: 'MAMA_KING',
  SEASON: 'VIC',
  CONTRACT: 'VIC',
};

function contactFor(quest: QuestDefinition): ContactKey {
  return CONTACT_BY_CATEGORY[quest.category] ?? CONTACT_BY_TYPE[quest.type];
}

function storyFor(quest: QuestDefinition, contactKey: ContactKey, contacts: ContactCatalog | undefined): NonNullable<QuestDefinition['story']> {
  const contactName = contacts?.[contactKey]?.shortName ?? contactKey;
  const objectiveText = [...quest.objectives, ...quest.bonusObjectives]
    .map((objective) => objective.description)
    .filter(Boolean)
    .join(' ');
  const chapter = quest.type === 'SECRET'
    ? 'Things that do not go on paper'
    : quest.type === 'DAILY' || quest.type === 'WEEKLY'
      ? 'The work that keeps the street moving'
      : quest.type === 'ALLIANCE' || quest.type === 'EVENT' || quest.type === 'SEASON'
        ? 'Everybody has a stake'
        : 'A favor with a face';

  return {
    chapter,
    intro: `${contactName} puts this job in your hands for a reason. ${quest.description}`,
    inProgress: `${contactName} is waiting for proof that the job is moving. ${objectiveText}`,
    ready: `${contactName} reviews the result and finds the work in order. The job is ready to be settled.`,
    completed: `${contactName} closes the book on “${quest.title}.” The result is now part of your working relationship.`,
    actionHint: objectiveText,
  };
}

/**
 * Completes the narrative contract for the 2.6-J catalog. Existing authored contacts and story
 * blocks are preserved; only missing fields receive a contact-aware fallback based on the job's
 * responsibility and authoritative objectives.
 */
export function completeQuestNarratives(
  catalog: QuestDefinitionCatalog,
  contacts: ContactCatalog | undefined,
): QuestDefinitionCatalog {
  return Object.fromEntries(Object.entries(catalog).map(([key, quest]) => {
    const contactKey = quest.contactKey ?? contactFor(quest);
    const narrativeContactKey = contactKey as ContactKey;
    return [key, {
      ...quest,
      contactKey,
      story: quest.story ?? storyFor(quest, narrativeContactKey, contacts),
    }];
  }));
}
