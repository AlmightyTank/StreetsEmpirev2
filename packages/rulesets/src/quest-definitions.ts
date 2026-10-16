import type { QuestCosmeticCatalog, QuestDataObject, QuestDefinition, QuestDefinitionCatalog, SecretContentMeta } from './types.js';

export const SECRET_TRIGGER_KINDS = [
  'STATE_AT_LEAST',
  'TURF_COUNT_AT_LEAST',
  'ACTIVITY_COUNT',
  'ACTIVITY_OBJECT_SUM_AT_LEAST',
] as const;

const SECRET_STATE_FIELDS = ['heat', 'whores', 'netWorthCents'] as const;

const SECRET_DISCOVERY_TIERS = ['OBVIOUS', 'HIDDEN', 'LEGENDARY'] as const;

const DISTRICT_KEYS = ['CASINO', 'WINO_SLUMS', 'LOW_RENT', 'NIGHTCLUB', 'URBAN_GHETTO'] as const;

function isRecord(value: unknown): value is QuestDataObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((item) => typeof item === 'string' && item.trim().length > 0)) return null;
  return value as string[];
}

/**
 * Slice A: per-kind secret trigger contract. Returns problem strings without
 * the catalog-key prefix so questDefinitionProblems can prefix them.
 */
export function secretTriggerProblems(trigger: unknown): string[] {
  if (!isRecord(trigger)) return ['SECRET secretTrigger must be an object'];
  const row = trigger;
  if (typeof row.kind !== 'string' || !row.kind.trim()) {
    return ['SECRET secretTrigger requires kind'];
  }
  if (!SECRET_TRIGGER_KINDS.includes(row.kind as (typeof SECRET_TRIGGER_KINDS)[number])) {
    return [`SECRET secretTrigger kind must be ${SECRET_TRIGGER_KINDS.join('|')}`];
  }
  if (typeof row.target !== 'number' || !Number.isFinite(row.target) || row.target <= 0) {
    return ['SECRET secretTrigger target must be greater than zero'];
  }

  switch (row.kind) {
    case 'STATE_AT_LEAST':
      if (typeof row.field !== 'string' || !(SECRET_STATE_FIELDS as readonly string[]).includes(row.field)) {
        return ['SECRET STATE_AT_LEAST secretTrigger field must be heat|whores|netWorthCents'];
      }
      return [];
    case 'TURF_COUNT_AT_LEAST':
      if (!Number.isSafeInteger(row.target)) {
        return ['SECRET TURF_COUNT_AT_LEAST secretTrigger target must be a whole number'];
      }
      return [];
    case 'ACTIVITY_COUNT':
      if (!nonEmptyStrings(row.eventTypes)) {
        return ['SECRET ACTIVITY_COUNT secretTrigger requires a non-empty eventTypes string array'];
      }
      if (row.where !== undefined && !isRecord(row.where)) {
        return ['SECRET ACTIVITY_COUNT secretTrigger where must be an object'];
      }
      return [];
    case 'ACTIVITY_OBJECT_SUM_AT_LEAST':
      if (!nonEmptyStrings(row.eventTypes)) {
        return ['SECRET ACTIVITY_OBJECT_SUM_AT_LEAST secretTrigger requires a non-empty eventTypes string array'];
      }
      if (typeof row.field !== 'string' || !row.field.trim()) {
        return ['SECRET ACTIVITY_OBJECT_SUM_AT_LEAST secretTrigger requires a field'];
      }
      if (row.where !== undefined && !isRecord(row.where)) {
        return ['SECRET ACTIVITY_OBJECT_SUM_AT_LEAST secretTrigger where must be an object'];
      }
      return [];
    default:
      return [];
  }
}

/**
 * Slice A: optional secret content descriptor contract (family, tier,
 * milestones, rarity, cooldown, districts, test/disable flags).
 */
export function secretContentProblems(content: unknown, quest: Pick<QuestDefinition, 'objectives'>): string[] {
  if (content === undefined) return [];
  if (!isRecord(content)) return ['SECRET secretContent must be an object'];
  const row = content as QuestDataObject & Partial<SecretContentMeta>;
  const problems: string[] = [];
  if (typeof row.family !== 'string' || !row.family.trim()) {
    problems.push('SECRET secretContent requires family');
  }
  if (typeof row.discoveryTier !== 'string' || !(SECRET_DISCOVERY_TIERS as readonly string[]).includes(row.discoveryTier)) {
    problems.push(`SECRET secretContent discoveryTier must be ${SECRET_DISCOVERY_TIERS.join('|')}`);
  }
  if (row.clueMilestones !== undefined) {
    if (!Array.isArray(row.clueMilestones) || row.clueMilestones.length === 0) {
      problems.push('SECRET secretContent clueMilestones must be a non-empty string array');
    } else {
      const ids = new Set(quest.objectives.map((objective) => objective.id));
      const seen = new Set<string>();
      for (const milestone of row.clueMilestones) {
        if (typeof milestone !== 'string' || !milestone.trim()) {
          problems.push('SECRET secretContent clueMilestones must be a non-empty string array');
          break;
        }
        if (seen.has(milestone)) {
          problems.push(`SECRET secretContent duplicate clue milestone ${milestone}`);
        }
        seen.add(milestone);
        if (!ids.has(milestone)) {
          problems.push(`SECRET secretContent unknown clue milestone ${milestone}`);
        }
      }
    }
  }
  if (row.rarityWeight !== undefined) {
    if (typeof row.rarityWeight !== 'number' || !Number.isFinite(row.rarityWeight) || row.rarityWeight <= 0) {
      problems.push('SECRET secretContent rarityWeight must be greater than zero');
    }
  }
  if (row.cooldownMinutes !== undefined && row.cooldownMinutes !== null) {
    if (!Number.isSafeInteger(row.cooldownMinutes) || row.cooldownMinutes < 0) {
      problems.push('SECRET secretContent cooldownMinutes must be a non-negative integer or null');
    }
  }
  if (row.districts !== undefined) {
    if (
      !Array.isArray(row.districts)
      || row.districts.length === 0
      || !(row.districts as unknown[]).every((district) => typeof district === 'string' && (DISTRICT_KEYS as readonly string[]).includes(district))
    ) {
      problems.push(`SECRET secretContent districts must be a non-empty array of ${DISTRICT_KEYS.join('|')}`);
    }
  }
  if (row.testOnly !== undefined && typeof row.testOnly !== 'boolean') {
    problems.push('SECRET secretContent testOnly must be a boolean');
  }
  if (row.disabled !== undefined && typeof row.disabled !== 'boolean') {
    problems.push('SECRET secretContent disabled must be a boolean');
  }
  return problems;
}

export function questDefinitionProblems(catalog: QuestDefinitionCatalog): string[] {
  const problems: string[] = [];

  for (const [catalogKey, quest] of Object.entries(catalog)) {
    if (quest.key !== catalogKey) {
      problems.push(`${catalogKey}: definition key is ${quest.key}`);
    }
    if (!quest.title.trim()) problems.push(`${catalogKey}: title is required`);
    if (!quest.description.trim()) problems.push(`${catalogKey}: description is required`);
    if (quest.objectives.length === 0) problems.push(`${catalogKey}: at least one objective is required`);
    if (quest.story) {
      for (const [field, value] of Object.entries(quest.story)) {
        if (typeof value !== 'string' || !value.trim()) {
          problems.push(`${catalogKey}: story.${field} is required`);
        }
      }
    }
    if (quest.type === 'SECRET') {
      if (quest.repeatability !== 'ONCE') problems.push(`${catalogKey}: SECRET quests must be ONCE`);
      if (quest.availability.hidden !== true) problems.push(`${catalogKey}: SECRET quests must set availability.hidden=true`);
      const trigger = quest.availability.secretTrigger;
      if (trigger === undefined) {
        problems.push(`${catalogKey}: SECRET quests require availability.secretTrigger`);
      } else {
        for (const problem of secretTriggerProblems(trigger)) {
          problems.push(`${catalogKey}: ${problem}`);
        }
      }
      for (const problem of secretContentProblems(quest.availability.secretContent, quest)) {
        problems.push(`${catalogKey}: ${problem}`);
      }
    }

    const seasonalEvent = quest.availability.seasonalEvent;
    if (seasonalEvent !== undefined) {
      if (quest.type !== 'EVENT') {
        problems.push(`${catalogKey}: seasonalEvent is only supported for EVENT quests`);
      }
      if (!seasonalEvent || typeof seasonalEvent !== 'object' || Array.isArray(seasonalEvent)) {
        problems.push(`${catalogKey}: seasonalEvent must be an object`);
      } else {
        const eventKey = seasonalEvent.eventKey;
        const startsAt = seasonalEvent.startsAt;
        const endsAt = seasonalEvent.endsAt;
        if (typeof eventKey !== 'string' || !eventKey.trim()) {
          problems.push(`${catalogKey}: seasonalEvent requires eventKey`);
        }
        if (
          typeof startsAt !== 'string'
          || !Number.isFinite(new Date(startsAt).getTime())
          || !/(Z|[+-]\d{2}:\d{2})$/.test(startsAt)
        ) {
          problems.push(`${catalogKey}: seasonalEvent startsAt must be a valid date with an explicit timezone`);
        }
        if (
          typeof endsAt !== 'string'
          || !Number.isFinite(new Date(endsAt).getTime())
          || !/(Z|[+-]\d{2}:\d{2})$/.test(endsAt)
        ) {
          problems.push(`${catalogKey}: seasonalEvent endsAt must be a valid date with an explicit timezone`);
        }
        if (
          typeof startsAt === 'string'
          && typeof endsAt === 'string'
          && Number.isFinite(new Date(startsAt).getTime())
          && Number.isFinite(new Date(endsAt).getTime())
          && new Date(startsAt).getTime() >= new Date(endsAt).getTime()
        ) {
          problems.push(`${catalogKey}: seasonalEvent startsAt must be before endsAt`);
        }
      }
    }
    const personalContribution = quest.availability.personalContribution;
    if (personalContribution !== undefined) {
      if (quest.type !== 'ALLIANCE') {
        problems.push(`${catalogKey}: personalContribution is only supported for ALLIANCE quests`);
      }
      if (!personalContribution || typeof personalContribution !== 'object' || Array.isArray(personalContribution)) {
        problems.push(`${catalogKey}: personalContribution must be an object`);
      } else {
        const row = personalContribution as QuestDataObject;
        const kind = row.kind;
        if (typeof row.id !== 'string' || !row.id.trim()) {
          problems.push(`${catalogKey}: personalContribution requires id`);
        }
        if (kind !== 'EVENT_COUNT' && kind !== 'EVENT_SUM') {
          problems.push(`${catalogKey}: personalContribution kind must be EVENT_COUNT or EVENT_SUM`);
        }
        if (typeof row.description !== 'string' || !row.description.trim()) {
          problems.push(`${catalogKey}: personalContribution requires description`);
        }
        if (typeof row.label !== 'string' || !row.label.trim()) {
          problems.push(`${catalogKey}: personalContribution requires label`);
        }
        if (typeof row.target !== 'number' || !Number.isFinite(row.target) || row.target <= 0) {
          problems.push(`${catalogKey}: personalContribution target must be greater than zero`);
        }
        const params = row.params;
        if (!params || typeof params !== 'object' || Array.isArray(params)) {
          problems.push(`${catalogKey}: personalContribution requires params`);
        } else {
          const config = params as QuestDataObject;
          const eventTypes = config.eventTypes;
          if (
            !Array.isArray(eventTypes)
            || eventTypes.length === 0
            || eventTypes.some((value) => typeof value !== 'string' || !value.trim())
          ) {
            problems.push(`${catalogKey}: personalContribution eventTypes must be a non-empty string array`);
          }
          if (kind === 'EVENT_SUM' && (typeof config.field !== 'string' || !config.field.trim())) {
            problems.push(`${catalogKey}: EVENT_SUM personalContribution requires a field`);
          }
        }
      }
    }

    for (const prerequisite of quest.prerequisites) {
      if (!prerequisite.kind.trim()) {
        problems.push(`${catalogKey}: prerequisite kind is required`);
        continue;
      }
      if (prerequisite.kind === 'QUEST_COMPLETED') {
        const key = prerequisite.params?.questKey;
        if (typeof key !== 'string' || !key.trim()) {
          problems.push(`${catalogKey}: QUEST_COMPLETED requires questKey`);
        } else if (!(key in catalog)) {
          problems.push(`${catalogKey}: unknown prerequisite quest ${key}`);
        } else if (key === quest.key) {
          problems.push(`${catalogKey}: quest cannot require itself`);
        }
      }
      if (prerequisite.kind === 'CONTACT_REP_AT_LEAST') {
        const contactKey = prerequisite.params?.contactKey;
        const points = prerequisite.params?.points;
        if (typeof contactKey !== 'string' || !contactKey.trim()) {
          problems.push(`${catalogKey}: CONTACT_REP_AT_LEAST requires contactKey`);
        }
        if (typeof points !== 'number' || !Number.isFinite(points) || points <= 0) {
          problems.push(`${catalogKey}: CONTACT_REP_AT_LEAST requires positive points`);
        }
      }
      if (prerequisite.kind === 'TIME_SINCE_JOIN') {
        const minutes = prerequisite.params?.minutes;
        if (!Number.isSafeInteger(minutes) || (minutes as number) <= 0) {
          problems.push(`${catalogKey}: TIME_SINCE_JOIN requires positive whole minutes`);
        }
      }
      if (prerequisite.kind === 'ACTION_COUNT') {
        const eventTypes = prerequisite.params?.eventTypes;
        const count = prerequisite.params?.count;
        const label = prerequisite.params?.label;
        if (!nonEmptyStrings(eventTypes)) {
          problems.push(`${catalogKey}: ACTION_COUNT requires a non-empty eventTypes string array`);
        }
        if (!Number.isSafeInteger(count) || (count as number) <= 0) {
          problems.push(`${catalogKey}: ACTION_COUNT requires positive whole count`);
        }
        if (label !== undefined && (typeof label !== 'string' || !label.trim())) {
          problems.push(`${catalogKey}: ACTION_COUNT label must be a non-empty string`);
        }
      }
      if (prerequisite.kind === 'FACTION_STANDING_AT_LEAST' || prerequisite.kind === 'FACTION_STANDING_BELOW') {
        const factionKey = prerequisite.params?.factionKey;
        const tier = prerequisite.params?.tier;
        if (typeof factionKey !== 'string' || !factionKey.trim()) {
          problems.push(`${catalogKey}: ${prerequisite.kind} requires factionKey`);
        }
        if (typeof tier !== 'string' || !['KNOWN', 'TRUSTED', 'CONNECTED', 'INNER_CIRCLE'].includes(tier)) {
          problems.push(`${catalogKey}: ${prerequisite.kind} requires a tier above UNKNOWN`);
        }
      }
      if (prerequisite.kind === 'BRANCH_CHOSEN') {
        const questKey = prerequisite.params?.questKey;
        const branchKey = prerequisite.params?.branchKey;
        if (typeof questKey !== 'string' || !questKey.trim()) {
          problems.push(`${catalogKey}: BRANCH_CHOSEN requires questKey`);
        } else if (!(questKey in catalog)) {
          problems.push(`${catalogKey}: unknown branch source quest ${questKey}`);
        } else if (questKey === quest.key) {
          problems.push(`${catalogKey}: quest cannot branch-require itself`);
        }
        if (typeof branchKey !== 'string' || !branchKey.trim()) {
          problems.push(`${catalogKey}: BRANCH_CHOSEN requires branchKey`);
        } else if (typeof questKey === 'string' && questKey in catalog) {
          const source = catalog[questKey];
          if (!source?.branches?.some((branch) => branch.key === branchKey)) {
            problems.push(`${catalogKey}: unknown branch ${questKey}/${branchKey}`);
          }
        }
      }
    }

    for (const reward of quest.rewards) {
      if (!reward.kind.trim()) {
        problems.push(`${catalogKey}: reward kind is required`);
        continue;
      }
      if (['CASH', 'TURNS', 'ITEM', 'CONTACT_REP'].includes(reward.kind)) {
        if (typeof reward.amount !== 'number' || !Number.isFinite(reward.amount) || reward.amount <= 0) {
          problems.push(`${catalogKey}: ${reward.kind} reward requires a positive amount`);
        }
      }
      if (reward.kind === 'FAVOR_ITEM' || reward.kind === 'PRODUCT' || reward.kind === 'FACTION_STANDING') {
        if (typeof reward.amount !== 'number' || !Number.isSafeInteger(reward.amount) || reward.amount <= 0) {
          problems.push(`${catalogKey}: ${reward.kind} reward requires a positive whole amount`);
        }
      }
      if (reward.kind === 'FACTION_STANDING' && quest.repeatability !== 'ONCE') {
        problems.push(`${catalogKey}: faction standing rewards require ONCE repeatability`);
      }
      if (['ITEM', 'CONTACT_REP', 'FAVOR_ITEM', 'COSMETIC_UNLOCK', 'PRODUCT', 'FACTION_STANDING'].includes(reward.kind) && (!reward.key || !reward.key.trim())) {
        problems.push(`${catalogKey}: ${reward.kind} reward requires a key`);
      }
      if (reward.kind === 'WEAPON_ACCESS' && !['SHOTGUN', 'TEK9', 'AK47'].includes(reward.key ?? '')) {
        problems.push(`${catalogKey}: WEAPON_ACCESS reward requires SHOTGUN, TEK9 or AK47`);
      }
      if (reward.kind === 'PERMANENT_UNLOCK' && (!reward.key || !reward.key.trim())) {
        problems.push(`${catalogKey}: PERMANENT_UNLOCK reward requires a key`);
      }
      if (reward.kind === 'COSMETIC_UNLOCK' && quest.repeatability !== 'ONCE') {
        problems.push(`${catalogKey}: permanent cosmetic rewards require ONCE repeatability`);
      }
    }

    if (quest.branches?.length) {
      if (quest.repeatability !== 'ONCE') {
        problems.push(`${catalogKey}: branching quests must be ONCE`);
      }
      const branchKeys = new Set<string>();
      for (const branch of quest.branches) {
        if (!branch.key.trim()) problems.push(`${catalogKey}: branch key is required`);
        if (branchKeys.has(branch.key)) problems.push(`${catalogKey}: duplicate branch ${branch.key}`);
        branchKeys.add(branch.key);
        if (!branch.title.trim()) problems.push(`${catalogKey}/${branch.key}: branch title is required`);
        if (!branch.description.trim()) problems.push(`${catalogKey}/${branch.key}: branch description is required`);
        for (const delta of branch.reputationDeltas) {
          if (!Number.isSafeInteger(delta.amount) || delta.amount === 0) {
            problems.push(`${catalogKey}/${branch.key}: reputation delta must be a non-zero whole number`);
          }
        }
        for (const key of branch.followUpKeys) {
          if (!(key in catalog)) problems.push(`${catalogKey}/${branch.key}: unknown branch follow-up ${key}`);
          if (!quest.followUpKeys.includes(key)) problems.push(`${catalogKey}/${branch.key}: branch follow-up ${key} must be listed on the quest`);
        }
        for (const reward of branch.rewards) {
          if (reward.kind === 'FACTION_STANDING') {
            problems.push(`${catalogKey}/${branch.key}: a branch pays standing through its reputation changes, not a standing reward`);
          }
          if (['CASH', 'TURNS', 'ITEM', 'CONTACT_REP', 'FAVOR_ITEM', 'PRODUCT'].includes(reward.kind)) {
            if (typeof reward.amount !== 'number' || !Number.isFinite(reward.amount) || reward.amount <= 0) {
              problems.push(`${catalogKey}/${branch.key}: ${reward.kind} reward requires a positive amount`);
            }
          }
          if (['ITEM', 'CONTACT_REP', 'FAVOR_ITEM', 'PERMANENT_UNLOCK', 'COSMETIC_UNLOCK', 'PRODUCT'].includes(reward.kind) && (!reward.key || !reward.key.trim())) {
            problems.push(`${catalogKey}/${branch.key}: ${reward.kind} reward requires a key`);
          }
          if (reward.kind === 'WEAPON_ACCESS' && !['SHOTGUN', 'TEK9', 'AK47'].includes(reward.key ?? '')) {
            problems.push(`${catalogKey}/${branch.key}: WEAPON_ACCESS reward requires SHOTGUN, TEK9 or AK47`);
          }
          if (reward.kind === 'COSMETIC_UNLOCK' && quest.repeatability !== 'ONCE') {
            problems.push(`${catalogKey}/${branch.key}: permanent cosmetic rewards require ONCE repeatability`);
          }
        }
      }
    }

    const seen = new Set<string>();
    for (const objective of [...quest.objectives, ...quest.bonusObjectives]) {
      if (!objective.id.trim()) problems.push(`${catalogKey}: objective id is required`);
      if (seen.has(objective.id)) problems.push(`${catalogKey}: duplicate objective id ${objective.id}`);
      seen.add(objective.id);
      if (!objective.kind.trim()) problems.push(`${catalogKey}/${objective.id}: objective kind is required`);
      if (!objective.description.trim()) problems.push(`${catalogKey}/${objective.id}: objective description is required`);
      if (!Number.isFinite(objective.target) || objective.target <= 0) {
        problems.push(`${catalogKey}/${objective.id}: target must be greater than zero`);
      }

      const eventTypes = objective.params?.eventTypes;
      const eventDriven = !['STATE_AT_LEAST', 'TURF_HOLD_HOURS'].includes(objective.kind);
      if (eventDriven && eventTypes === undefined) {
        problems.push(`${catalogKey}/${objective.id}: ${objective.kind} requires eventTypes`);
      } else if (eventTypes !== undefined && (
        !Array.isArray(eventTypes)
        || eventTypes.length === 0
        || eventTypes.some((value) => typeof value !== 'string' || !value.trim())
      )) {
        problems.push(`${catalogKey}/${objective.id}: eventTypes must be a non-empty string array`);
      }

      if (['EVENT_SUM', 'STATE_AT_LEAST', 'UNIQUE_VALUES'].includes(objective.kind)) {
        const field = objective.params?.field;
        if (typeof field !== 'string' || !field.trim()) {
          problems.push(`${catalogKey}/${objective.id}: ${objective.kind} requires a field`);
        }
      }

      if (objective.kind === 'RECRUIT_CREW') {
        const crew = objective.params?.crew;
        if (crew !== undefined && !['ANY', 'WHORES', 'THUGS'].includes(String(crew))) {
          problems.push(`${catalogKey}/${objective.id}: crew must be ANY, WHORES or THUGS`);
        }
      }
    }

    if (
      quest.expiresAfterMinutes !== null &&
      (!Number.isInteger(quest.expiresAfterMinutes) || quest.expiresAfterMinutes <= 0)
    ) {
      problems.push(`${catalogKey}: expiresAfterMinutes must be a positive integer or null`);
    }

    const followUps = new Set<string>();
    for (const key of quest.followUpKeys) {
      if (key === quest.key) problems.push(`${catalogKey}: quest cannot follow up to itself`);
      if (!(key in catalog)) problems.push(`${catalogKey}: unknown follow-up ${key}`);
      if (followUps.has(key)) problems.push(`${catalogKey}: duplicate follow-up ${key}`);
      followUps.add(key);
    }
  }

  return problems;
}

/**
 * Cross-check quest cosmetic rewards against the ruleset cosmetic catalog.
 * The structural validator above only proves a COSMETIC_UNLOCK has a key;
 * this check proves the key can actually be awarded at claim time.
 */
export function questCosmeticProblems(
  catalog: QuestDefinitionCatalog,
  cosmetics: QuestCosmeticCatalog | undefined,
): string[] {
  const problems: string[] = [];
  for (const [catalogKey, quest] of Object.entries(catalog)) {
    for (const reward of quest.rewards) {
      if (reward.kind !== 'COSMETIC_UNLOCK') continue;
      const key = reward.key;
      if (!key || !(key in (cosmetics ?? {}))) {
        problems.push(`${catalogKey}: COSMETIC_UNLOCK reward ${key ?? '(missing key)'} is not in ruleset cosmetics`);
      }
    }
    for (const branch of quest.branches ?? []) {
      for (const reward of branch.rewards) {
        if (reward.kind !== 'COSMETIC_UNLOCK') continue;
        const key = reward.key;
        if (!key || !(key in (cosmetics ?? {}))) {
          problems.push(`${catalogKey}/${branch.key}: COSMETIC_UNLOCK reward ${key ?? '(missing key)'} is not in ruleset cosmetics`);
        }
      }
    }
  }
  return problems;
}

/**
 * Products a job's required objectives cook. A player must hold each product's recipe
 * before the job can be done; bonus objectives stay optional, so they are not counted.
 */
export function questRequiredRecipes(quest: Pick<QuestDefinition, 'objectives'>): string[] {
  const products = new Set<string>();
  for (const objective of quest.objectives) {
    const eventTypes = objective.params?.eventTypes;
    const where = objective.params?.where as QuestDataObject | undefined;
    if (!Array.isArray(eventTypes) || !eventTypes.includes('PRODUCE_CRACK')) continue;
    if (typeof where?.productType === 'string') products.add(where.productType);
  }
  return [...products];
}

/**
 * Districts a job's required objectives send the player to scout. A player must hold each
 * district's access before the job can be done; bonus objectives stay optional.
 */
export function questRequiredDistricts(quest: Pick<QuestDefinition, 'objectives'>): string[] {
  const districts = new Set<string>();
  for (const objective of quest.objectives) {
    const eventTypes = objective.params?.eventTypes;
    const where = objective.params?.where as QuestDataObject | undefined;
    if (!Array.isArray(eventTypes) || !eventTypes.includes('SCOUT')) continue;
    if (typeof where?.districtKey === 'string') districts.add(where.districtKey);
  }
  return [...districts];
}

export function defineQuestCatalog<const T extends QuestDefinitionCatalog>(catalog: T): T {
  const problems = questDefinitionProblems(catalog);
  if (problems.length) {
    throw new Error(`Invalid quest catalog:\n- ${problems.join('\n- ')}`);
  }
  return catalog;
}

export function defineQuest<const T extends QuestDefinition>(quest: T): T {
  return quest;
}
