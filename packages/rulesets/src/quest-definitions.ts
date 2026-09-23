import type { QuestDataObject, QuestDefinition, QuestDefinitionCatalog } from './types.js';

export function questDefinitionProblems(catalog: QuestDefinitionCatalog): string[] {
  const problems: string[] = [];

  for (const [catalogKey, quest] of Object.entries(catalog)) {
    if (quest.key !== catalogKey) {
      problems.push(`${catalogKey}: definition key is ${quest.key}`);
    }
    if (!quest.title.trim()) problems.push(`${catalogKey}: title is required`);
    if (!quest.description.trim()) problems.push(`${catalogKey}: description is required`);
    if (quest.objectives.length === 0) problems.push(`${catalogKey}: at least one objective is required`);
    if (quest.type === 'SECRET') {
      if (quest.repeatability !== 'ONCE') problems.push(`${catalogKey}: SECRET quests must be ONCE`);
      if (quest.availability.hidden !== true) problems.push(`${catalogKey}: SECRET quests must set availability.hidden=true`);
      const trigger = quest.availability.secretTrigger;
      if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) {
        problems.push(`${catalogKey}: SECRET quests require availability.secretTrigger`);
      } else {
        const row = trigger as QuestDataObject;
        if (typeof row.kind !== 'string' || !row.kind.trim()) {
          problems.push(`${catalogKey}: SECRET secretTrigger requires kind`);
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
      if (reward.kind === 'FAVOR_ITEM') {
        if (typeof reward.amount !== 'number' || !Number.isSafeInteger(reward.amount) || reward.amount <= 0) {
          problems.push(`${catalogKey}: FAVOR_ITEM reward requires a positive whole amount`);
        }
      }
      if (['ITEM', 'CONTACT_REP', 'FAVOR_ITEM', 'COSMETIC_UNLOCK'].includes(reward.kind) && (!reward.key || !reward.key.trim())) {
        problems.push(`${catalogKey}: ${reward.kind} reward requires a key`);
      }
      if (reward.kind === 'WEAPON_ACCESS' && !['SHOTGUN', 'TEK9', 'AK47'].includes(reward.key ?? '')) {
        problems.push(`${catalogKey}: WEAPON_ACCESS reward requires SHOTGUN, TEK9 or AK47`);
      }
      if (reward.kind === 'PERMANENT_UNLOCK' && (!reward.key || !reward.key.trim())) {
        problems.push(`${catalogKey}: PERMANENT_UNLOCK reward requires a key`);
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
          if (['CASH', 'TURNS', 'ITEM', 'CONTACT_REP', 'FAVOR_ITEM'].includes(reward.kind)) {
            if (typeof reward.amount !== 'number' || !Number.isFinite(reward.amount) || reward.amount <= 0) {
              problems.push(`${catalogKey}/${branch.key}: ${reward.kind} reward requires a positive amount`);
            }
          }
          if (['ITEM', 'CONTACT_REP', 'FAVOR_ITEM', 'PERMANENT_UNLOCK', 'COSMETIC_UNLOCK'].includes(reward.kind) && (!reward.key || !reward.key.trim())) {
            problems.push(`${catalogKey}/${branch.key}: ${reward.kind} reward requires a key`);
          }
          if (reward.kind === 'WEAPON_ACCESS' && !['SHOTGUN', 'TEK9', 'AK47'].includes(reward.key ?? '')) {
            problems.push(`${catalogKey}/${branch.key}: WEAPON_ACCESS reward requires SHOTGUN, TEK9 or AK47`);
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
