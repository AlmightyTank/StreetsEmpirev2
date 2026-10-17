import type { Prisma, Round } from '@prisma/client';
import { activeRoundEventTime, eventCatalogForRuleset } from '@streets/rulesets';
import type { CityConditionRules, Ruleset } from '@streets/rulesets';
import type { CityConditionDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { emitCityMemoryEvent } from './city-memory.service.js';

const MAX_CONDITION_BONUS_PERCENT = 15;

type EventRound = Pick<Round, 'id' | 'startsAt' | 'endsAt' | 'pausedAt' | 'pausedMinutesTotal'>;
type CityConditionAction = CityConditionRules['actions'][number];

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function pauseOffset(round: EventRound, now: Date): number {
  return Math.max(0, round.pausedMinutesTotal) * 60_000
    + (round.pausedAt ? Math.max(0, now.getTime() - round.pausedAt.getTime()) : 0);
}

function wallClock(logicalTime: Date, round: EventRound, now: Date): Date {
  return new Date(logicalTime.getTime() + pauseOffset(round, now));
}

function activeRoundBounds(round: EventRound): { start: Date; end: Date } {
  const completedPauseMs = Math.max(0, round.pausedMinutesTotal) * 60_000;
  return { start: round.startsAt, end: new Date(round.endsAt.getTime() - completedPauseMs) };
}

function scheduleWindow(round: EventRound, condition: CityConditionRules): { start: Date; end: Date } | null {
  if (!condition.schedule) return null;
  const { start, end } = activeRoundBounds(round);
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) return null;
  return {
    start: new Date(start.getTime() + durationMs * condition.schedule.startFraction),
    end: new Date(start.getTime() + durationMs * condition.schedule.endFraction),
  };
}

function definitionKey(condition: CityConditionRules): string {
  return `CITY:${condition.key}`;
}

async function ensureDefinition(db: Db, ruleset: Ruleset, condition: CityConditionRules): Promise<string> {
  const catalogEntry = eventCatalogForRuleset(ruleset).find((entry) => entry.type === 'CITY_CONDITION' && entry.key === definitionKey(condition));
  if (!catalogEntry) throw new Error(`City condition ${condition.key} is missing from the event catalog.`);
  const row = await db.gameEventDefinition.upsert({
    where: { rulesetId_rulesetVersion_key: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, key: catalogEntry.key } },
    create: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key: catalogEntry.key,
      type: 'CITY_CONDITION',
      scope: 'CITY',
      title: catalogEntry.title,
      description: catalogEntry.description,
      schedule: inputJson(catalogEntry.schedule),
      objectives: inputJson([]),
      rewards: inputJson([]),
      config: inputJson(catalogEntry.config),
      sourceKind: 'CITY_CONDITION',
      sourceKey: condition.key,
    },
    update: {},
    select: { id: true },
  });
  return row.id;
}

async function recordLifecycle(
  db: Db,
  occurrenceId: string,
  action: 'ACTIVATED' | 'EXPIRED',
  happenedAt: Date,
): Promise<void> {
  await db.gameEventHistory.createMany({
    data: [{
      occurrenceId,
      action,
      dedupeKey: `city-condition:${occurrenceId}:${action.toLowerCase()}`,
      happenedAt,
    }],
    skipDuplicates: true,
  });
}

async function syncScheduledCondition(
  db: Db,
  round: EventRound,
  cityId: string,
  ruleset: Ruleset,
  condition: CityConditionRules,
  now: Date,
): Promise<void> {
  const window = scheduleWindow(round, condition);
  if (!window) return;
  const definitionId = await ensureDefinition(db, ruleset, condition);
  const logicalNow = activeRoundEventTime(round, now);
  const currentStatus = logicalNow < window.start ? 'SCHEDULED' : logicalNow < window.end ? 'ACTIVE' : 'EXPIRED';
  const occurrenceKey = `round:${round.id}:city:${cityId}:condition:${condition.key}`;
  const occurrence = await db.gameEventOccurrence.upsert({
    where: { definitionId_occurrenceKey: { definitionId, occurrenceKey } },
    create: {
      definitionId,
      roundId: round.id,
      occurrenceKey,
      scopeKey: cityId,
      status: currentStatus,
      startsAt: wallClock(window.start, round, now),
      endsAt: wallClock(window.end, round, now),
      schedule: inputJson({ kind: 'ROUND_FRACTION', ...condition.schedule }),
      config: inputJson({
        conditionKey: condition.key,
        districts: condition.districts,
        actions: condition.actions,
        effects: condition.effects,
        schedule: condition.schedule,
      }),
      ...(currentStatus === 'ACTIVE' ? { activatedAt: now } : {}),
      ...(currentStatus === 'EXPIRED' ? { expiredAt: now } : {}),
    },
    update: {},
    select: { id: true, status: true },
  });

  const nextStatus = occurrence.status === 'CANCELLED' || occurrence.status === 'COMPLETED'
    ? occurrence.status
    : currentStatus;
  if (nextStatus !== occurrence.status) {
    await db.gameEventOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: nextStatus,
        startsAt: wallClock(window.start, round, now),
        endsAt: wallClock(window.end, round, now),
        ...(nextStatus === 'ACTIVE' ? { activatedAt: now } : {}),
        ...(nextStatus === 'EXPIRED' ? { expiredAt: now } : {}),
      },
    });
    if (nextStatus === 'ACTIVE' || nextStatus === 'EXPIRED') await recordLifecycle(db, occurrence.id, nextStatus === 'ACTIVE' ? 'ACTIVATED' : 'EXPIRED', now);
  } else if (occurrence.status === 'SCHEDULED' || occurrence.status === 'ACTIVE') {
    // Keep the displayed end time aligned when a round pause is extended.
    await db.gameEventOccurrence.update({
      where: { id: occurrence.id },
      data: { startsAt: wallClock(window.start, round, now), endsAt: wallClock(window.end, round, now) },
    });
  }
  if (nextStatus === 'ACTIVE') await recordLifecycle(db, occurrence.id, 'ACTIVATED', now);
  if (nextStatus === 'EXPIRED') await recordLifecycle(db, occurrence.id, 'EXPIRED', now);
}

async function syncFollowUpLifecycles(db: Db, round: EventRound, cityId: string, ruleset: Ruleset, now: Date): Promise<void> {
  const rows = await db.gameEventOccurrence.findMany({
    where: { roundId: round.id, scopeKey: cityId, definition: { is: { type: 'CITY_CONDITION', rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version } } },
    select: { id: true, status: true, startsAt: true, endsAt: true, config: true },
  });
  const logicalNow = activeRoundEventTime(round, now);
  for (const row of rows) {
    const config = object(row.config);
    const startedAt = typeof config?.followUpStartedAtLogical === 'string' ? new Date(config.followUpStartedAtLogical) : null;
    const duration = typeof config?.durationMinutes === 'number' ? config.durationMinutes : null;
    if (!startedAt || !duration || row.status !== 'ACTIVE') continue;
    const logicalEnd = new Date(startedAt.getTime() + duration * 60_000);
    const end = wallClock(logicalEnd, round, now);
    await db.gameEventOccurrence.update({ where: { id: row.id }, data: { endsAt: end } });
    if (logicalNow >= logicalEnd) {
      await db.gameEventOccurrence.updateMany({ where: { id: row.id, status: 'ACTIVE' }, data: { status: 'EXPIRED', expiredAt: now } });
      await recordLifecycle(db, row.id, 'EXPIRED', now);
    }
  }
}

async function syncScheduledConditions(db: Db, round: EventRound, cityId: string, ruleset: Ruleset, now: Date): Promise<void> {
  if (ruleset.meta.eventSystem?.cityConditions !== 'FIRST_CLASS') return;
  const conditions = ruleset.cityConditions ?? [];
  for (const condition of conditions) {
    if (condition.schedule) await syncScheduledCondition(db, round, cityId, ruleset, condition, now);
    else await ensureDefinition(db, ruleset, condition);
  }
  await syncFollowUpLifecycles(db, round, cityId, ruleset, now);
}

function conditionDto(row: {
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  config: Prisma.JsonValue;
  definition: { key: string; title: string; description: string };
}): CityConditionDto {
  const config = object(row.config) ?? {};
  const followUpFrom = object(config.followUpFrom);
  return {
    key: typeof config.conditionKey === 'string' ? config.conditionKey : row.definition.key.replace(/^CITY:/, ''),
    title: row.definition.title,
    description: row.definition.description,
    status: row.status === 'ACTIVE' ? 'ACTIVE' : 'UPCOMING',
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    districts: Array.isArray(config.districts) ? config.districts.filter((value): value is string => typeof value === 'string') : [],
    actions: Array.isArray(config.actions) ? config.actions.filter((value): value is string => typeof value === 'string') : [],
    effects: object(config.effects) ?? {},
    ...(followUpFrom && typeof followUpFrom.key === 'string' && typeof followUpFrom.type === 'string'
      ? { followUpFrom: { type: followUpFrom.type, key: followUpFrom.key } }
      : {}),
  };
}

export interface CityConditionBonuses {
  recruitPercent: number;
  productPercent: number;
  cashGainPercent: number;
}

export const CityConditionService = {
  async page(db: Db, roundPlayerId: string, ruleset: Ruleset, now = new Date()): Promise<CityConditionDto[]> {
    if (ruleset.meta.eventSystem?.cityConditions !== 'FIRST_CLASS' || !db.gameEventOccurrence?.findMany) return [];
    const player = await db.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: { cityId: true, round: { select: { id: true, startsAt: true, endsAt: true, pausedAt: true, pausedMinutesTotal: true } } },
    });
    if (!player) return [];
    await syncScheduledConditions(db, player.round, player.cityId, ruleset, now);
    const rows = await db.gameEventOccurrence.findMany({
      where: {
        roundId: player.round.id,
        scopeKey: player.cityId,
        status: { in: ['SCHEDULED', 'ACTIVE'] },
        definition: { is: { type: 'CITY_CONDITION', rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version } },
      },
      select: { status: true, startsAt: true, endsAt: true, config: true, definition: { select: { key: true, title: true, description: true } } },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(conditionDto);
  },

  async bonuses(
    db: Db,
    input: { round: EventRound; cityId: string; ruleset: Ruleset; action: CityConditionAction; district: string; now: Date },
  ): Promise<CityConditionBonuses> {
    const none = { recruitPercent: 0, productPercent: 0, cashGainPercent: 0 };
    if (input.ruleset.meta.eventSystem?.cityConditions !== 'FIRST_CLASS' || !db.gameEventOccurrence?.findMany) return none;
    await syncScheduledConditions(db, input.round, input.cityId, input.ruleset, input.now);
    const rows = await db.gameEventOccurrence.findMany({
      where: {
        roundId: input.round.id,
        scopeKey: input.cityId,
        status: 'ACTIVE',
        startsAt: { lte: input.now },
        endsAt: { gt: input.now },
        definition: { is: { type: 'CITY_CONDITION', rulesetId: input.ruleset.meta.id, rulesetVersion: input.ruleset.meta.version } },
      },
      select: { config: true },
    });
    const bonuses = { ...none };
    for (const row of rows) {
      const config = object(row.config);
      const districts = Array.isArray(config?.districts) ? config.districts : [];
      const actions = Array.isArray(config?.actions) ? config.actions : [];
      if ((input.district !== 'CITY' && !districts.includes(input.district)) || !actions.includes(input.action)) continue;
      const effects = object(config?.effects) ?? {};
      for (const key of Object.keys(bonuses) as Array<keyof CityConditionBonuses>) {
        const value = effects[key];
        if (typeof value === 'number' && Number.isFinite(value)) bonuses[key] += value;
      }
    }
    for (const key of Object.keys(bonuses) as Array<keyof CityConditionBonuses>) {
      bonuses[key] = Math.max(0, Math.min(MAX_CONDITION_BONUS_PERCENT, bonuses[key]));
    }
    return bonuses;
  },

  async activateFollowUpsForEvent(
    db: Db,
    input: { round: EventRound; cityId: string; ruleset: Ruleset; parentType: 'COMMUNITY' | 'SEASONAL'; parentKey: string; now: Date },
  ): Promise<void> {
    if (input.ruleset.meta.eventSystem?.cityConditions !== 'FIRST_CLASS') return;
    const conditions = (input.ruleset.cityConditions ?? []).filter((condition) =>
      !condition.schedule && condition.followUpFrom?.type === input.parentType && condition.followUpFrom.key === input.parentKey,
    );
    for (const condition of conditions) {
      const definitionId = await ensureDefinition(db, input.ruleset, condition);
      const logicalStart = activeRoundEventTime(input.round, input.now);
      const logicalRoundEnd = activeRoundBounds(input.round).end;
      const remainingMinutes = Math.floor((logicalRoundEnd.getTime() - logicalStart.getTime()) / 60_000);
      if (remainingMinutes < 1) continue;
      const durationMinutes = Math.max(1, Math.min(24 * 60, condition.durationMinutes ?? 60, remainingMinutes));
      const logicalEnd = new Date(logicalStart.getTime() + durationMinutes * 60_000);
      const occurrenceKey = `follow-up:${input.round.id}:${input.cityId}:${input.parentType}:${input.parentKey}:${condition.key}`;
      const created = await db.gameEventOccurrence.upsert({
        where: { definitionId_occurrenceKey: { definitionId, occurrenceKey } },
        create: {
          definitionId,
          roundId: input.round.id,
          occurrenceKey,
          scopeKey: input.cityId,
          status: 'ACTIVE',
          startsAt: wallClock(logicalStart, input.round, input.now),
          endsAt: wallClock(logicalEnd, input.round, input.now),
          schedule: inputJson({ kind: 'EVENT_FOLLOW_UP', parentType: input.parentType, parentKey: input.parentKey, durationMinutes }),
          config: inputJson({
            conditionKey: condition.key,
            districts: condition.districts,
            actions: condition.actions,
            effects: condition.effects,
            followUpFrom: condition.followUpFrom,
            followUpStartedAtLogical: logicalStart.toISOString(),
            durationMinutes,
          }),
          activatedAt: input.now,
        },
        update: {},
        select: { id: true, createdAt: true },
      });
      await recordLifecycle(db, created.id, 'ACTIVATED', input.now);
      // Only event-settled follow-up city conditions seed a public opportunity.
      // Scheduled/page-driven condition reads do not grant invitations.
      if (input.ruleset.livingStories?.STORY_MIDNIGHT_SIGNAL?.enabled) {
        await emitCityMemoryEvent(db, {
          roundId: input.round.id, cityId: input.cityId, kind: 'city_condition_follow_up',
          visibility: 'public', actorRoundPlayerIds: [],
          summary: { occurrenceId: created.id, conditionKey: condition.key },
          happenedAt: input.now, idempotencyKey: `city-condition-follow-up:${created.id}`,
        });
      }
    }
  },
};
