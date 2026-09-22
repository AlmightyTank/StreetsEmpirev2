import type {
  QuestDataObject,
  QuestDataValue,
  QuestObjectiveAdvance,
  QuestObjectiveDefinition,
  QuestObjectiveProgress,
  QuestProgressEvent,
  QuestProgressMap,
} from './types.js';

export interface QuestProgressApplication {
  readonly matched: boolean;
  readonly changed: boolean;
  readonly completed: boolean;
  readonly progress: QuestProgressMap;
  readonly deltas: Readonly<Record<string, number>>;
}

function object(value: QuestDataValue | undefined): QuestDataObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as QuestDataObject
    : null;
}

function valueAt(root: QuestDataValue, path: string): QuestDataValue | undefined {
  let current: QuestDataValue | undefined = root;
  for (const part of path.split('.')) {
    const row = object(current);
    if (!row || !(part in row)) return undefined;
    current = row[part];
  }
  return current;
}

function stringParam(params: QuestDataObject | undefined, key: string): string | undefined {
  const value = params?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function eventTypes(params: QuestDataObject | undefined): string[] | null {
  const raw = params?.eventTypes;
  if (!Array.isArray(raw)) return null;
  return raw.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function sameJson(left: QuestDataValue | undefined, right: QuestDataValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchesWhere(payload: QuestDataValue, params: QuestDataObject | undefined): boolean {
  const where = object(params?.where);
  if (!where) return true;
  return Object.entries(where).every(([path, expected]) => sameJson(valueAt(payload, path), expected));
}

function matchesEvent(event: QuestProgressEvent, params: QuestDataObject | undefined): boolean {
  const types = eventTypes(params);
  if (types && !types.includes(event.type)) return false;
  return matchesWhere(event.payload, params);
}

function positiveNumber(value: QuestDataValue | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function amountFor(objective: QuestObjectiveDefinition, event: QuestProgressEvent): number {
  if (!matchesEvent(event, objective.params)) return 0;

  switch (objective.kind) {
    case 'EVENT_COUNT':
      return 1;

    case 'EVENT_SUM': {
      const field = stringParam(objective.params, 'field');
      return field ? positiveNumber(valueAt(event.payload, field)) : 0;
    }

    case 'SPEND_TURNS':
      return positiveNumber(valueAt(event.payload, 'turns'))
        || positiveNumber(valueAt(event.payload, 'turnsUsed'));

    case 'EARN_CASH':
      return positiveNumber(valueAt(event.payload, 'cashCents'));

    case 'RECRUIT_CREW': {
      const crew = stringParam(objective.params, 'crew') ?? 'ANY';
      const whores = positiveNumber(valueAt(event.payload, 'whores'));
      const thugs = positiveNumber(valueAt(event.payload, 'thugs'));
      if (crew === 'WHORES') return whores;
      if (crew === 'THUGS') return thugs;
      return whores + thugs;
    }

    case 'WIN_EVENTS':
      return valueAt(event.payload, 'won') === true ? 1 : 0;

    case 'STATE_AT_LEAST':
      return 0;
  }
}

function currentFor(objective: QuestObjectiveDefinition, existing?: QuestObjectiveProgress): number {
  if (!existing || existing.target !== objective.target || !Number.isFinite(existing.current)) return 0;
  return Math.min(objective.target, Math.max(0, existing.current));
}

export function advanceQuestObjective(
  objective: QuestObjectiveDefinition,
  event: QuestProgressEvent,
  existing?: QuestObjectiveProgress,
): QuestObjectiveAdvance {
  const before = currentFor(objective, existing);

  if (objective.kind === 'STATE_AT_LEAST') {
    if (!matchesEvent(event, objective.params)) {
      return {
        matched: false,
        amount: 0,
        progress: { current: before, target: objective.target, completed: before >= objective.target },
      };
    }
    const field = stringParam(objective.params, 'field');
    const raw = field && event.state ? valueAt(event.state, field) : undefined;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return {
        matched: false,
        amount: 0,
        progress: { current: before, target: objective.target, completed: before >= objective.target },
      };
    }
    const current = Math.min(objective.target, Math.max(0, raw));
    return {
      matched: true,
      amount: current - before,
      progress: { current, target: objective.target, completed: current >= objective.target },
    };
  }

  const raw = amountFor(objective, event);
  const amount = Math.min(Math.max(0, raw), Math.max(0, objective.target - before));
  const current = Math.min(objective.target, before + amount);

  return {
    matched: raw > 0,
    amount,
    progress: {
      current,
      target: objective.target,
      completed: current >= objective.target,
    },
  };
}

export function applyQuestProgress(
  objectives: readonly QuestObjectiveDefinition[],
  existing: QuestProgressMap | undefined,
  event: QuestProgressEvent,
): QuestProgressApplication {
  const progress: Record<string, QuestObjectiveProgress> = {};
  const deltas: Record<string, number> = {};
  let matched = false;
  let changed = false;

  for (const objective of objectives) {
    const advanced = advanceQuestObjective(objective, event, existing?.[objective.id]);
    progress[objective.id] = advanced.progress;
    if (advanced.matched) matched = true;
    if (advanced.amount !== 0) {
      changed = true;
      deltas[objective.id] = advanced.amount;
    }
  }

  return {
    matched,
    changed,
    completed: objectives.length > 0 && objectives.every((objective) => progress[objective.id]?.completed),
    progress,
    deltas,
  };
}
