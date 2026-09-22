import type { QuestDefinition, QuestDefinitionCatalog } from './types.js';

export function questDefinitionProblems(catalog: QuestDefinitionCatalog): string[] {
  const problems: string[] = [];

  for (const [catalogKey, quest] of Object.entries(catalog)) {
    if (quest.key !== catalogKey) {
      problems.push(`${catalogKey}: definition key is ${quest.key}`);
    }
    if (!quest.title.trim()) problems.push(`${catalogKey}: title is required`);
    if (!quest.description.trim()) problems.push(`${catalogKey}: description is required`);
    if (quest.objectives.length === 0) problems.push(`${catalogKey}: at least one objective is required`);

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
      if ((reward.kind === 'ITEM' || reward.kind === 'CONTACT_REP') && (!reward.key || !reward.key.trim())) {
        problems.push(`${catalogKey}: ${reward.kind} reward requires a key`);
      }
      if (reward.kind === 'WEAPON_ACCESS' && !['SHOTGUN', 'TEK9', 'AK47'].includes(reward.key ?? '')) {
        problems.push(`${catalogKey}: WEAPON_ACCESS reward requires SHOTGUN, TEK9 or AK47`);
      }
      if (reward.kind === 'PERMANENT_UNLOCK' && (!reward.key || !reward.key.trim())) {
        problems.push(`${catalogKey}: PERMANENT_UNLOCK reward requires a key`);
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
      const eventDriven = objective.kind !== 'STATE_AT_LEAST';
      if (eventDriven && eventTypes === undefined) {
        problems.push(`${catalogKey}/${objective.id}: ${objective.kind} requires eventTypes`);
      } else if (eventTypes !== undefined && (
        !Array.isArray(eventTypes)
        || eventTypes.length === 0
        || eventTypes.some((value) => typeof value !== 'string' || !value.trim())
      )) {
        problems.push(`${catalogKey}/${objective.id}: eventTypes must be a non-empty string array`);
      }

      if (objective.kind === 'EVENT_SUM' || objective.kind === 'STATE_AT_LEAST') {
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
