import type { QuestDefinition, QuestObjectiveDefinition } from '../types.js';

/**
 * Activity types written only by the law Case (warrants, lawyers, payroll, informants).
 * A board contract that requires one cannot be finished once that system is off.
 * Living-streets case files listen for INFORMANT_TIP, but they do not deal these jobs.
 */
const LAW_CASE_EVENTS = new Set([
  'CASE_STAGE_UP',
  'CASE_COOLED',
  'CASE_FOLLOWED',
  'LAWYER_RETAINED',
  'WARRANT_LAWYERED',
  'WARRANT_QUASHED',
  'WARRANT_DRAFTED',
  'WARRANT_SERVED',
  'OFFICIAL_HIRED',
  'OFFICIAL_CUT',
  'OFFICIAL_IA_OPENED',
  'OFFICIAL_STUNG',
  'CAPTAIN_TIP',
  'INFORMANT_TIP',
]);

function eventTypes(objective: QuestObjectiveDefinition): readonly string[] {
  const types = objective.params?.eventTypes;
  if (!Array.isArray(types)) return [];
  return types.filter((type): type is string => typeof type === 'string');
}

/** True when this objective can advance only through the law Case. */
export function objectiveNeedsLawCase(objective: QuestObjectiveDefinition): boolean {
  const types = eventTypes(objective);
  return types.length > 0 && types.every((type) => LAW_CASE_EVENTS.has(type));
}

/** True when a required objective cannot be finished without the law Case. */
export function questNeedsLawCase(definition: Pick<QuestDefinition, 'objectives'>): boolean {
  return definition.objectives.some(objectiveNeedsLawCase);
}
