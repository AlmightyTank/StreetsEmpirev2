import type {
  QuestDataObject,
  RandomEncounterTrigger,
  Ruleset,
} from './types.js';

export const GAME_EVENT_TYPES = [
  'COMMUNITY',
  'SEASONAL',
  'RANDOM_ENCOUNTER',
  'CITY_CONDITION',
] as const;
export type GameEventType = typeof GAME_EVENT_TYPES[number];

export const GAME_EVENT_SCOPES = ['ROUND', 'PLAYER', 'CITY'] as const;
export type GameEventScope = typeof GAME_EVENT_SCOPES[number];

export type GameEventSchedule =
  | {
      readonly kind: 'ROUND_FRACTION';
      readonly startFraction: number;
      readonly endFraction: number;
    }
  | {
      readonly kind: 'UTC_WINDOW';
      readonly eventKey: string;
      readonly startsAt: string;
      readonly endsAt: string;
    }
  | {
      readonly kind: 'ACTION_TRIGGER';
      readonly trigger: RandomEncounterTrigger;
      readonly chance: number;
      readonly chanceBasis?: 'TURN';
      readonly cooldownMinutes: number;
      readonly perKeyCooldownMinutes: number;
      readonly minTurns: number;
    }
  | {
      readonly kind: 'EVENT_FOLLOW_UP';
      readonly parentType: 'COMMUNITY' | 'SEASONAL';
      readonly parentKey: string;
      readonly durationMinutes: number;
    };

export type GameEventLegacySource =
  | { readonly kind: 'QUEST_DEFINITION'; readonly key: string }
  | { readonly kind: 'RANDOM_ENCOUNTER_ENTRY'; readonly key: string }
  | { readonly kind: 'CITY_CONDITION'; readonly key: string };

export interface GameEventCatalogEntry {
  readonly key: string;
  readonly rulesetId: string;
  readonly rulesetVersion: string;
  readonly type: GameEventType;
  readonly scope: GameEventScope;
  readonly title: string;
  readonly description: string;
  readonly schedule: GameEventSchedule;
  readonly legacySource: GameEventLegacySource;
  /** Objectives, reward rules, and legacy behavior retained as a versioned snapshot. */
  readonly config: QuestDataObject;
}

function dataObject(value: unknown): QuestDataObject {
  return value as QuestDataObject;
}

/**
 * Maps the current Phase U and Y-F jobs and the action encounter pool into
 * stable first-class identities. This is a catalog adapter only: it does not
 * write records or change runtime behavior, so older pinned rounds are intact.
 */
export function eventCatalogForRuleset(ruleset: Ruleset): GameEventCatalogEntry[] {
  const result: GameEventCatalogEntry[] = [];
  const rulesetId = ruleset.meta.id;
  const rulesetVersion = ruleset.meta.version;

  for (const definition of Object.values(ruleset.questDefinitions ?? {})) {
    const availability = definition.availability;
    if (availability.communityEvent === true) {
      const startFraction = availability.roundStartFraction;
      const endFraction = availability.roundEndFraction;
      if (typeof startFraction !== 'number' || typeof endFraction !== 'number') continue;
      result.push({
        key: definition.key,
        rulesetId,
        rulesetVersion,
        type: 'COMMUNITY',
        scope: 'ROUND',
        title: definition.title,
        description: definition.description,
        schedule: { kind: 'ROUND_FRACTION', startFraction, endFraction },
        legacySource: { kind: 'QUEST_DEFINITION', key: definition.key },
        config: dataObject({
          objectives: definition.objectives,
          bonusObjectives: definition.bonusObjectives,
          rewards: definition.rewards,
          personalContributionTarget: availability.personalContributionTarget,
          contributionLabel: availability.contributionLabel,
          repeatability: definition.repeatability,
          expiresAfterMinutes: definition.expiresAfterMinutes,
        }),
      });
      continue;
    }

    const seasonal = availability.seasonalEvent;
    if (definition.type !== 'EVENT' || !seasonal) continue;
    result.push({
      key: seasonal.eventKey,
      rulesetId,
      rulesetVersion,
      type: 'SEASONAL',
      scope: 'PLAYER',
      title: definition.title,
      description: definition.description,
      schedule: {
        kind: 'UTC_WINDOW',
        eventKey: seasonal.eventKey,
        startsAt: seasonal.startsAt,
        endsAt: seasonal.endsAt,
      },
      legacySource: { kind: 'QUEST_DEFINITION', key: definition.key },
      config: dataObject({
        objectives: definition.objectives,
        bonusObjectives: definition.bonusObjectives,
        rewards: definition.rewards,
        repeatability: definition.repeatability,
        expiresAfterMinutes: definition.expiresAfterMinutes,
      }),
    });
  }

  const encounters = ruleset.randomEncounters;
  if (encounters?.enabled) {
    for (const [triggerName, trigger] of Object.entries(encounters.triggers)) {
      if (!trigger?.enabled) continue;
      const triggerKey = triggerName as RandomEncounterTrigger;
      for (const entry of trigger.entries) {
        result.push({
          key: `${triggerKey}:${entry.key}`,
          rulesetId,
          rulesetVersion,
          type: 'RANDOM_ENCOUNTER',
          scope: 'PLAYER',
          title: entry.title,
          description: entry.text,
          schedule: {
            kind: 'ACTION_TRIGGER',
            trigger: triggerKey,
            chance: trigger.chance,
            ...(trigger.chanceBasis === 'TURN' ? { chanceBasis: 'TURN' as const } : {}),
            cooldownMinutes: trigger.cooldownMinutes ?? 0,
            perKeyCooldownMinutes: trigger.perKeyCooldownMinutes ?? 0,
            minTurns: trigger.minTurns ?? 1,
          },
          legacySource: { kind: 'RANDOM_ENCOUNTER_ENTRY', key: entry.key },
          config: dataObject({
            weight: entry.weight,
            tone: entry.tone,
            districts: entry.districts ?? [],
            availableUtc: entry.availableUtc ?? null,
            cash: entry.cash ?? null,
            heat: entry.heat ?? null,
            supplies: entry.supplies ?? null,
            choices: entry.choices ?? [],
          }),
        });
      }
    }
  }

  for (const condition of ruleset.cityConditions ?? []) {
    result.push({
      key: `CITY:${condition.key}`,
      rulesetId,
      rulesetVersion,
      type: 'CITY_CONDITION',
      scope: 'CITY',
      title: condition.title,
      description: condition.description,
      schedule: condition.schedule
        ? { kind: 'ROUND_FRACTION', ...condition.schedule }
        : {
            kind: 'EVENT_FOLLOW_UP',
            parentType: condition.followUpFrom?.type ?? 'COMMUNITY',
            parentKey: condition.followUpFrom?.key ?? '',
            durationMinutes: condition.durationMinutes ?? 0,
          },
      legacySource: { kind: 'CITY_CONDITION', key: condition.key },
      config: dataObject({
        districts: condition.districts,
        actions: condition.actions,
        effects: condition.effects,
        schedule: condition.schedule ?? null,
        followUpFrom: condition.followUpFrom ?? null,
        durationMinutes: condition.durationMinutes ?? null,
      }),
    });
  }

  return result.sort((left, right) =>
    left.type.localeCompare(right.type) || left.key.localeCompare(right.key),
  );
}

/** Active round time excludes completed pauses and the current open pause. */
export function activeRoundEventTime(
  round: { pausedAt: Date | null; pausedMinutesTotal: number },
  now: Date,
): Date {
  const completedPauseMs = Math.max(0, round.pausedMinutesTotal) * 60_000;
  const currentPauseMs = round.pausedAt
    ? Math.max(0, now.getTime() - round.pausedAt.getTime())
    : 0;
  return new Date(now.getTime() - completedPauseMs - currentPauseMs);
}
