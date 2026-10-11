import { Prisma, type GameEventType, type GameEventScope, type PrismaClient } from '@prisma/client';
import { eventCatalogForRuleset, rulesets } from '@streets/rulesets';
import type { AdminEventCalendarInput, AdminEventPreviewDto, AdminEventReleaseReportDto, AdminEventTuneInput } from '@streets/shared';
import { AdminAuditService } from './admin-audit.service.js';
import type { AuditActor } from './admin-audit.service.js';
import { AppError } from '../utils/errors.js';

const eventTypes: GameEventType[] = ['COMMUNITY', 'SEASONAL', 'RANDOM_ENCOUNTER', 'CITY_CONDITION'];
const eventScopes: GameEventScope[] = ['ROUND', 'PLAYER', 'CITY'];
const actionNames = ['SCOUT', 'PRODUCE_CRACK', 'STORE_SELL'];
const actionEffect: Record<string, 'cashGainPercent' | 'recruitPercent' | 'productPercent'> = {
  SCOUT: 'recruitPercent',
  PRODUCE_CRACK: 'productPercent',
  STORE_SELL: 'cashGainPercent',
};

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function firstClassTypes(ruleset: (typeof rulesets)[string]): string[] {
  const flags = ruleset.meta.eventSystem;
  return [
    ...(flags?.communityEvents ? ['COMMUNITY'] : []),
    ...(flags?.seasonalEvents ? ['SEASONAL'] : []),
    ...(flags?.randomEncounters ? ['RANDOM_ENCOUNTER'] : []),
    ...(flags?.cityConditions ? ['CITY_CONDITION'] : []),
  ];
}

function staticChecks(ruleset: (typeof rulesets)[string]): AdminEventPreviewDto['checks'] {
  const catalog = eventCatalogForRuleset(ruleset);
  const checks: AdminEventPreviewDto['checks'] = [];
  const keys = catalog.map((entry) => `${entry.type}:${entry.key}`);
  const duplicateKeys = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
  checks.push({
    key: 'catalog-keys',
    status: duplicateKeys.length ? 'FAIL' : 'PASS',
    detail: duplicateKeys.length ? `Duplicate catalog keys: ${duplicateKeys.join(', ')}` : `${catalog.length} event definitions have unique type/key pairs.`,
  });

  const invalidConditions = (ruleset.cityConditions ?? []).filter((condition) =>
    !condition.actions.length
    || condition.actions.some((action) => !actionNames.includes(action))
    || Object.values(condition.effects).some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 15)
    || (condition.schedule && (condition.schedule.startFraction < 0 || condition.schedule.endFraction > 1 || condition.schedule.startFraction >= condition.schedule.endFraction))
    || (condition.followUpFrom && (!condition.durationMinutes || condition.durationMinutes <= 0 || condition.durationMinutes > 24 * 60)),
  );
  checks.push({
    key: 'city-modifier-bounds',
    status: invalidConditions.length ? 'FAIL' : 'PASS',
    detail: invalidConditions.length ? `Invalid or unbounded conditions: ${invalidConditions.map((condition) => condition.key).join(', ')}` : 'City modifiers are nonnegative, individually capped at 15%, and have bounded windows.',
  });

  const missingParents = (ruleset.cityConditions ?? []).filter((condition) => condition.followUpFrom
    && !catalog.some((entry) => entry.type === condition.followUpFrom!.type && entry.key === condition.followUpFrom!.key));
  checks.push({
    key: 'follow-up-source',
    status: missingParents.length ? 'FAIL' : 'PASS',
    detail: missingParents.length ? `Follow-ups reference missing events: ${missingParents.map((condition) => condition.key).join(', ')}` : 'Every configured follow-up points to a catalog event.',
  });
  return checks;
}

function modifierSimulation(ruleset: (typeof rulesets)[string]): AdminEventPreviewDto['modifierSimulation'] {
  const rows: AdminEventPreviewDto['modifierSimulation'] = [];
  const conditions = ruleset.cityConditions ?? [];
  const districts = [...new Set(conditions.flatMap((condition) => condition.districts))];
  for (const action of actionNames) {
    for (const district of districts) {
      const matching = conditions.filter((condition) => condition.actions.includes(action as never) && condition.districts.includes(district as never));
      if (!matching.length) continue;
      const effect = actionEffect[action as keyof typeof actionEffect]!;
      const rawPercent = matching.reduce((sum, condition) => sum + (condition.effects[effect] ?? 0), 0);
      rows.push({ action, district, rawPercent, cappedPercent: Math.min(15, rawPercent), sourceKeys: matching.map((condition) => condition.key) });
    }
  }
  return rows;
}

function assertDraftRuleset(rulesetId: string, rulesetVersion: string) {
  const ruleset = rulesets[rulesetId];
  if (!ruleset || ruleset.meta.version !== rulesetVersion) {
    throw AppError.badRequest('EVENT_RULESET_NOT_PINNED', 'Choose a ruleset version shipped by this server.');
  }
  if (firstClassTypes(ruleset).length === 0) {
    throw AppError.badRequest('EVENT_RULESET_NOT_FIRST_CLASS', 'Event drafts require a first-class event ruleset.');
  }
  return ruleset;
}

export const AdminEventService = {
  async releaseReport(prisma: PrismaClient, now = new Date()): Promise<AdminEventReleaseReportDto> {
    const knownRulesets = Object.values(rulesets);
    const firstClass = knownRulesets.filter((ruleset) => firstClassTypes(ruleset).length > 0);
    const firstClassIds = firstClass.map((ruleset) => ruleset.meta.id);
    const [roundRows, definitionRows, statusGroups, occurrenceRows, historyRows, metrics, legacyEncounterRowsInFirstClassRounds] = await Promise.all([
      prisma.round.findMany({ where: { status: { in: ['SCHEDULED', 'REGISTRATION', 'ACTIVE'] } }, select: { id: true, name: true, status: true, rulesetId: true, rulesetVersion: true }, orderBy: { startsAt: 'desc' } }),
      prisma.gameEventDefinition.findMany({ orderBy: [{ updatedAt: 'desc' }, { key: 'asc' }], take: 250 }),
      prisma.gameEventOccurrence.groupBy({ by: ['definitionId', 'status'], _count: { _all: true } }),
      prisma.gameEventOccurrence.findMany({ orderBy: [{ startsAt: 'asc' }, { updatedAt: 'desc' }], take: 120, include: { definition: { select: { key: true, title: true, type: true } }, round: { select: { name: true } }, _count: { select: { participations: true } } } }),
      prisma.gameEventHistory.findMany({ orderBy: { happenedAt: 'desc' }, take: 100, include: { occurrence: { include: { definition: { select: { key: true, title: true } } } } } }),
      Promise.all([
        prisma.gameEventDefinition.count(),
        prisma.gameEventOccurrence.count(),
        prisma.gameEventParticipation.count(),
        prisma.gameEventProgressReceipt.count(),
        prisma.gameEventRewardClaim.count(),
        prisma.randomEncounter.count(),
        prisma.questDefinition.count({ where: { type: 'EVENT', rulesetId: { in: firstClassIds } } }),
        prisma.playerQuest.count({ where: { claimedAt: { not: null }, questDefinition: { is: { type: 'EVENT', rulesetId: { in: firstClassIds } } } } }),
        prisma.gameEventParticipation.count({
          where: {
            claimedAt: { not: null },
            occurrence: {
              is: { definition: { is: { type: { in: ['COMMUNITY', 'SEASONAL'] }, rulesetId: { in: firstClassIds } } } },
            },
          },
        }),
      ]),
      firstClassIds.length
        ? prisma.randomEncounter.count({
          where: {
            roundPlayer: {
              is: {
                round: { is: { rulesetId: { in: firstClassIds } } },
              },
            },
          },
        })
        : Promise.resolve(0),
    ]);

    const counts = new Map<string, Record<string, number>>();
    for (const group of statusGroups) {
      const row = counts.get(group.definitionId) ?? {};
      row[group.status] = group._count._all;
      counts.set(group.definitionId, row);
    }
    const definitions = definitionRows.map((row) => {
      const rowCounts = counts.get(row.id) ?? {};
      return {
        id: row.id,
        key: row.key,
        type: row.type,
        scope: row.scope,
        title: row.title,
        description: row.description,
        schedule: row.schedule,
        objectives: row.objectives,
        rewards: row.rewards,
        config: row.config,
        sourceKind: row.sourceKind,
        sourceKey: row.sourceKey,
        isEnabled: row.isEnabled,
        updatedAt: row.updatedAt.toISOString(),
        occurrences: {
          total: Object.values(rowCounts).reduce((sum, value) => sum + value, 0),
          active: rowCounts.ACTIVE ?? 0,
          scheduled: rowCounts.SCHEDULED ?? 0,
          completed: rowCounts.COMPLETED ?? 0,
          expired: rowCounts.EXPIRED ?? 0,
          cancelled: rowCounts.CANCELLED ?? 0,
        },
      };
    });
    const calendar = occurrenceRows.map((row) => ({
      id: row.id,
      key: row.definition.key,
      title: row.definition.title,
      type: row.definition.type,
      roundId: row.roundId,
      roundName: row.round?.name ?? null,
      scopeKey: row.scopeKey,
      status: row.status,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      participantCount: row._count.participations,
      updatedAt: row.updatedAt.toISOString(),
    }));
    const history = historyRows.map((row) => ({
      id: row.id,
      key: row.occurrence.definition.key,
      title: row.occurrence.definition.title,
      action: row.action,
      actorLabel: row.actorLabel,
      happenedAt: row.happenedAt.toISOString(),
      payload: row.payload,
    }));
    const duplicateSourceMappings = [...new Set(definitionRows
      .filter((row) => row.sourceKind && row.sourceKey)
      .map((row) => `${row.rulesetId}@${row.rulesetVersion}:${row.sourceKind}:${row.sourceKey}`)
      .filter((source, index, all) => all.indexOf(source) !== index))];
    const ruleRoundRows = roundRows.map((round) => {
      const ruleset = rulesets[round.rulesetId];
      return { ...round, compatible: Boolean(ruleset && ruleset.meta.version === round.rulesetVersion) };
    });
    const metricsDto = {
      definitions: metrics[0], occurrences: metrics[1], participations: metrics[2], progressReceipts: metrics[3], rewardClaims: metrics[4],
      legacyRandomEncounters: metrics[5], legacyEventQuests: metrics[6], legacyClaims: metrics[7], firstClassEventClaims: metrics[8],
    };
    const claimCountGap = Math.abs(metricsDto.legacyClaims - metricsDto.firstClassEventClaims);
    const checks: AdminEventReleaseReportDto['checks'] = [
      { key: 'pinned-rounds', status: ruleRoundRows.some((round) => !round.compatible) ? 'FAIL' : 'PASS', detail: ruleRoundRows.some((round) => !round.compatible) ? 'At least one scheduled or active round references an unavailable ruleset version.' : `${ruleRoundRows.length} scheduled, registering, or active rounds match their pinned ruleset versions.` },
      { key: 'catalog-integrity', status: duplicateSourceMappings.length ? 'FAIL' : 'PASS', detail: duplicateSourceMappings.length ? `Duplicate legacy mappings: ${duplicateSourceMappings.join(', ')}` : `${definitionRows.length} stored definitions have no duplicate source mapping.` },
      { key: 'migration-claims', status: metricsDto.legacyClaims || metricsDto.firstClassEventClaims ? 'REVIEW' : 'PASS', detail: metricsDto.legacyClaims || metricsDto.firstClassEventClaims ? `${metricsDto.legacyClaims} legacy claims and ${metricsDto.firstClassEventClaims} first-class claimed participations (aggregate delta ${claimCountGap}); per-player progress and claim parity still needs verification before retiring adapters.` : 'No legacy or first-class claims exist yet, so there is no migrated claim history to compare.' },
      { key: 'legacy-encounter-writer', status: legacyEncounterRowsInFirstClassRounds ? 'REVIEW' : 'PASS', detail: legacyEncounterRowsInFirstClassRounds ? `${legacyEncounterRowsInFirstClassRounds} legacy encounter rows exist in first-class ruleset rounds; inspect for duplicate writes before cleanup.` : 'No legacy random-encounter rows are present in first-class ruleset rounds.' },
    ];
    return {
      generatedAt: now.toISOString(),
      rulesets: firstClass.map((ruleset) => ({ id: ruleset.meta.id, version: ruleset.meta.version, name: ruleset.meta.name, firstClassTypes: firstClassTypes(ruleset), catalogEntries: eventCatalogForRuleset(ruleset).length })),
      rounds: ruleRoundRows,
      metrics: metricsDto,
      migration: { claimCountGap, legacyEncounterRowsInFirstClassRounds, duplicateSourceMappings },
      definitions,
      calendar,
      history,
      checks,
    };
  },

  preview(rulesetId: string): AdminEventPreviewDto {
    const ruleset = rulesets[rulesetId];
    if (!ruleset) throw AppError.notFound('RULESET_NOT_FOUND', 'That ruleset does not exist.');
    const catalog = eventCatalogForRuleset(ruleset);
    const entries = catalog.map((entry) => ({
      key: entry.key, type: entry.type, scope: entry.scope, title: entry.title, description: entry.description,
      schedule: entry.schedule, objectives: entry.config.objectives ?? [], rewards: entry.config.rewards ?? [], config: entry.config,
    }));
    return {
      ruleset: { id: ruleset.meta.id, version: ruleset.meta.version, name: ruleset.meta.name },
      firstClassTypes: firstClassTypes(ruleset),
      catalog: entries,
      modifierSimulation: modifierSimulation(ruleset),
      checks: staticChecks(ruleset),
    };
  },

  async createDraft(
    prisma: PrismaClient,
    actor: AuditActor,
    input: AdminEventTuneInput & { rulesetId: string; rulesetVersion: string; key: string; type: GameEventType; scope: GameEventScope },
  ) {
    const ruleset = assertDraftRuleset(input.rulesetId, input.rulesetVersion);
    if (!eventTypes.includes(input.type) || !eventScopes.includes(input.scope)) throw AppError.badRequest('EVENT_DRAFT_TYPE_INVALID', 'Choose a supported event type and scope.');
    if (eventCatalogForRuleset(ruleset).some((entry) => entry.key === input.key)) throw AppError.conflict('EVENT_DRAFT_KEY_RESERVED', 'That key is already owned by this pinned ruleset.');
    const existingDraft = await prisma.gameEventDefinition.findFirst({ where: { rulesetId: input.rulesetId, rulesetVersion: input.rulesetVersion, key: input.key } });
    if (existingDraft) throw AppError.conflict('EVENT_DRAFT_KEY_RESERVED', 'A definition with that key already exists in this pinned ruleset.');
    const draft = await prisma.$transaction(async (tx) => {
      const created = await tx.gameEventDefinition.create({
        data: {
          rulesetId: input.rulesetId, rulesetVersion: input.rulesetVersion, key: input.key, type: input.type, scope: input.scope,
          title: input.title ?? input.key, description: input.description ?? '', schedule: jsonValue(input.schedule ?? {}),
          objectives: jsonValue(input.objectives ?? []), rewards: jsonValue(input.rewards ?? []), config: jsonValue(input.config ?? {}),
          sourceKind: null, sourceKey: null, isEnabled: false,
        },
      });
      await AdminAuditService.record(tx, actor, { action: 'event.draft.create', targetType: 'game-event-definition', targetId: created.id, reason: input.reason, after: created });
      return created;
    });
    return { draft };
  },

  async tuneDraft(prisma: PrismaClient, actor: AuditActor, id: string, input: AdminEventTuneInput) {
    const before = await prisma.gameEventDefinition.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('EVENT_DEFINITION_NOT_FOUND', 'That event definition does not exist.');
    if (before.sourceKind || before.sourceKey) throw AppError.conflict('EVENT_DEFINITION_CODE_OWNED', 'Code-owned event definitions are changed through a new pinned ruleset.');
    const occurrenceCount = await prisma.gameEventOccurrence.count({ where: { definitionId: id } });
    if (occurrenceCount) throw AppError.conflict('EVENT_DRAFT_IN_USE', 'This draft has calendar records. Create a new draft version before changing its definition.');
    const data = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isEnabled !== undefined ? { isEnabled: false } : {}),
      ...(input.schedule !== undefined ? { schedule: jsonValue(input.schedule) } : {}),
      ...(input.objectives !== undefined ? { objectives: jsonValue(input.objectives) } : {}),
      ...(input.rewards !== undefined ? { rewards: jsonValue(input.rewards) } : {}),
      ...(input.config !== undefined ? { config: jsonValue(input.config) } : {}),
    };
    const after = await prisma.$transaction(async (tx) => {
      const updated = await tx.gameEventDefinition.update({ where: { id }, data });
      await AdminAuditService.record(tx, actor, { action: 'event.draft.tune', targetType: 'game-event-definition', targetId: id, reason: input.reason, before, after: updated });
      return updated;
    });
    return { draft: after };
  },

  async calendar(prisma: PrismaClient, actor: AuditActor, occurrenceId: string, input: AdminEventCalendarInput) {
    const before = await prisma.gameEventOccurrence.findUnique({ where: { id: occurrenceId }, include: { definition: true } });
    if (!before) throw AppError.notFound('EVENT_OCCURRENCE_NOT_FOUND', 'That event occurrence does not exist.');
    if (before.status !== 'SCHEDULED') throw AppError.conflict('EVENT_CALENDAR_LOCKED', 'Only scheduled events can be rescheduled or cancelled.');
    if (input.cancel && (input.startsAt !== undefined || input.endsAt !== undefined)) throw AppError.badRequest('EVENT_CALENDAR_INPUT', 'Cancel or reschedule an occurrence in one action, not both.');
    const startsAt = input.startsAt === undefined ? before.startsAt : input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt === undefined ? before.endsAt : input.endsAt ? new Date(input.endsAt) : null;
    if (!input.cancel && (!startsAt || !endsAt || startsAt >= endsAt)) throw AppError.badRequest('EVENT_CALENDAR_WINDOW', 'A scheduled event needs a start before its end.');
    const after = await prisma.$transaction(async (tx) => {
      const result = await tx.gameEventOccurrence.updateMany({
        where: { id: occurrenceId, status: 'SCHEDULED' },
        data: input.cancel ? { status: 'CANCELLED' } : { startsAt, endsAt },
      });
      if (result.count !== 1) throw AppError.conflict('EVENT_CALENDAR_LOCKED', 'The event started or changed while this update was being saved. Refresh and review its current status.');
      const updated = await tx.gameEventOccurrence.findUniqueOrThrow({ where: { id: occurrenceId } });
      await tx.gameEventHistory.create({
        data: {
          occurrenceId,
          action: input.cancel ? 'ADMIN_CANCELLED' : 'ADMIN_RESCHEDULED',
          actorLabel: actor.username,
          payload: jsonValue({ reason: input.reason }),
          before: jsonValue({ startsAt: before.startsAt, endsAt: before.endsAt, status: before.status }),
          after: jsonValue({ startsAt: updated.startsAt, endsAt: updated.endsAt, status: updated.status }),
          happenedAt: new Date(),
        },
      });
      await AdminAuditService.record(tx, actor, { action: input.cancel ? 'event.calendar.cancel' : 'event.calendar.reschedule', targetType: 'game-event-occurrence', targetId: occurrenceId, reason: input.reason, before, after: updated });
      return updated;
    });
    return { occurrence: after };
  },
};
