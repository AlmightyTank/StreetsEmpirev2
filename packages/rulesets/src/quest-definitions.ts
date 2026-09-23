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

    const seasonalEvent = quest.availability.seasonalEvent;
    if (seasonalEvent !== undefined) {
      if (quest.type !== 'EVENT') {
        problems.push(`${catalogKey}: seasonalEvent is only supported for EVENT quests`);
      }
      if (!seasonalEvent || typeof seasonalEvent !== 'object' || Array.isArray(seasonalEvent)) {
        problems.push(`${catalogKey}: seasonalEvent must be an object`);
      } else {
        const row = seasonalEvent as QuestDataObject;
        const eventKey = row.eventKey;
        const startsAt = row.startsAt;
        const endsAt = row.endsAt;
        if (typeof eventKey !== 'string' || !eventKey.trim()) {
          problems.push(`${catalogKey}: seasonalEvent requires eventKey`);
        }
        if (
          typeof startsAt !== 'string'
          || !Number.isFinite(new Date(startsAt).getTime())
          || !/(Z|[+-]\\d{2}:\\d{2})$/.test(startsAt)
        ) {
          problems.push(`${catalogKey}: seasonalEvent startsAt must be a valid date with an explicit timezone`);
        }
        if (
          typeof endsAt !== 'string'
          || !Number.isFinite(new Date(endsAt).getTime())
          || !/(Z|[+-]\\d{2}:\\d{2})$/.test(endsAt)
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