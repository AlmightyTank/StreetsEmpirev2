import type { Prisma, PrismaClient, RandomEncounter } from '@prisma/client';
import type { DistrictKey, RandomEncounterEntryRules, RandomEncounterTrigger, RandomEncounterTriggerRules, Ruleset } from '@streets/rulesets';
import type { RandomEncounterDto } from '@streets/shared';
import { eventCatalogForRuleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import type { PlayerState } from './action.service.js';

type EncounterEffectSource = Pick<RandomEncounterEntryRules, 'cash' | 'heat' | 'supplies'>;
type EncounterEffects = RandomEncounterDto['effects'];
type SupplyEffectKey = 'condoms' | 'medicine' | 'crack' | 'beer';

const SUPPLY_EFFECT_KEYS: readonly SupplyEffectKey[] = ['condoms', 'medicine', 'crack', 'beer'];

interface ScoutEncounterInput {
  tx: Db;
  roundPlayerId: string;
  next: PlayerState;
  ruleset: Ruleset;
  district: DistrictKey;
  turns: number;
  now: Date;
  rng?: () => number;
}

interface ProduceEncounterInput {
  tx: Db;
  roundPlayerId: string;
  next: PlayerState;
  ruleset: Ruleset;
  turns: number;
  now: Date;
  rng?: () => number;
}

interface TravelEncounterInput {
  tx: Db;
  roundPlayerId: string;
  next: PlayerState;
  ruleset: Ruleset;
  turns: number;
  now: Date;
  rng?: () => number;
}

interface EncounterSettlement {
  next: PlayerState;
  encounter?: RandomEncounterDto;
}

interface ActionEncounterInput {
  tx: Db;
  roundPlayerId: string;
  next: PlayerState;
  ruleset: Ruleset;
  turns: number;
  now: Date;
  rng?: () => number;
}

const FIRST_CLASS_ENCOUNTER_ID_PREFIX = 'event_';

export function usesFirstClassRandomEncounters(ruleset: Ruleset): boolean {
  return ruleset.meta?.eventSystem?.randomEncounters === 'FIRST_CLASS';
}

/**
 * Odds that one action draws an encounter from this trigger. A TURN trigger rolls each
 * turn spent and stops at the first hit, which comes to 1 - (1 - chance)^turns, so it is
 * settled with one draw against that.
 */
export function triggerChance(trigger: Pick<RandomEncounterTriggerRules, 'chance' | 'chanceBasis'>, turns: number): number {
  const chance = Math.min(1, Math.max(0, trigger.chance));
  if (trigger.chanceBasis !== 'TURN') return chance;
  return 1 - (1 - chance) ** Math.max(1, Math.floor(turns));
}

function randomInt(min: number, max: number, rng: () => number): number {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  if (high <= low) return low;
  return low + Math.floor(rng() * (high - low + 1));
}

function pickWeighted(entries: readonly RandomEncounterEntryRules[], rng: () => number): RandomEncounterEntryRules | null {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1] ?? null;
}

function object(value: Prisma.JsonValue | unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cashEffect(value: Prisma.JsonValue | unknown): RandomEncounterDto['effects'] {
  const source = object(value);
  return {
    ...(typeof source?.cashCents === 'number' ? { cashCents: source.cashCents } : {}),
    ...(typeof source?.heat === 'number' ? { heat: source.heat } : {}),
    ...(typeof source?.condoms === 'number' ? { condoms: source.condoms } : {}),
    ...(typeof source?.medicine === 'number' ? { medicine: source.medicine } : {}),
    ...(typeof source?.crack === 'number' ? { crack: source.crack } : {}),
    ...(typeof source?.beer === 'number' ? { beer: source.beer } : {}),
  };
}

function choicesOf(value: Prisma.JsonValue): RandomEncounterDto['choices'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((choice) => object(choice))
    .filter((choice): choice is Record<string, unknown> => Boolean(choice))
    .map((choice) => ({
      key: typeof choice.key === 'string' ? choice.key : '',
      label: typeof choice.label === 'string' ? choice.label : '',
      text: typeof choice.text === 'string' ? choice.text : '',
      effects: cashEffect(choice.effects),
    }))
    .filter((choice) => choice.key && choice.label);
}

export function toRandomEncounterDto(row: RandomEncounter): RandomEncounterDto {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    text: row.text,
    tone: row.tone as RandomEncounterDto['tone'],
    status: row.status === 'PENDING' ? 'PENDING' : 'RESOLVED',
    effects: cashEffect(row.effects),
    choices: choicesOf(row.choices),
  };
}

function cappedDelta(current: number, desired: number): number {
  return desired < 0 ? -Math.min(Math.abs(desired), current) : desired;
}

export function capRandomEncounterEffects(effects: EncounterEffects, next: PlayerState): EncounterEffects {
  return {
    ...(effects.cashCents
      ? { cashCents: effects.cashCents < 0 ? -Math.min(Math.abs(effects.cashCents), Number(next.cashCents)) : effects.cashCents }
      : {}),
    ...(effects.heat ? { heat: cappedDelta(next.heat, effects.heat) } : {}),
    ...(effects.condoms ? { condoms: cappedDelta(next.condoms, effects.condoms) } : {}),
    ...(effects.medicine ? { medicine: cappedDelta(next.medicine, effects.medicine) } : {}),
    ...(effects.crack ? { crack: cappedDelta(next.crack, effects.crack) } : {}),
    ...(effects.beer ? { beer: cappedDelta(next.beer, effects.beer) } : {}),
  };
}

export function applyRandomEncounterEffects(next: PlayerState, effects: EncounterEffects): PlayerState {
  return {
    ...next,
    cashCents: effects.cashCents ? next.cashCents + BigInt(effects.cashCents) : next.cashCents,
    heat: effects.heat ? next.heat + effects.heat : next.heat,
    condoms: effects.condoms ? next.condoms + effects.condoms : next.condoms,
    medicine: effects.medicine ? next.medicine + effects.medicine : next.medicine,
    crack: effects.crack ? next.crack + effects.crack : next.crack,
    beer: effects.beer ? next.beer + effects.beer : next.beer,
  };
}

function rollEffects(source: EncounterEffectSource, next: PlayerState, rng: () => number): EncounterEffects {
  const effects: EncounterEffects = {
    ...(source.cash ? { cashCents: randomInt(source.cash.minCents, source.cash.maxCents, rng) } : {}),
    ...(source.heat ? { heat: randomInt(source.heat.min, source.heat.max, rng) } : {}),
  };
  for (const key of SUPPLY_EFFECT_KEYS) {
    const rule = source.supplies?.[key];
    if (rule) effects[key] = randomInt(rule.min, rule.max, rng);
  }
  return capRandomEncounterEffects(effects, next);
}

function settle(entry: RandomEncounterEntryRules, next: PlayerState, rng: () => number): EncounterSettlement {
  if (entry.choices?.length) {
    return {
      next,
      encounter: {
        key: entry.key,
        title: entry.title,
        text: entry.text,
        tone: entry.tone,
        status: 'PENDING',
        effects: {},
        choices: entry.choices.map((choice) => ({
          key: choice.key,
          label: choice.label,
          text: choice.text,
          effects: rollEffects(choice, next, rng),
        })),
      },
    };
  }

  const effects = rollEffects(entry, next, rng);
  return {
    next: applyRandomEncounterEffects(next, effects),
    encounter: {
      key: entry.key,
      title: entry.title,
      text: entry.text,
      tone: entry.tone,
      effects,
    },
  };
}

async function recentEncounterKeys(input: Pick<ScoutEncounterInput, 'tx' | 'roundPlayerId' | 'now'>, trigger: RandomEncounterTrigger, minutes: number): Promise<Set<string>> {
  if (minutes <= 0) return new Set();
  const rows = await input.tx.randomEncounter.findMany({
    where: {
      roundPlayerId: input.roundPlayerId,
      trigger,
      createdAt: { gte: new Date(input.now.getTime() - minutes * 60_000) },
    },
    select: { key: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return new Set(rows.map((row) => row.key).filter((key): key is string => Boolean(key)));
}

export function encounterActivityPayload(encounter: RandomEncounterDto): Prisma.InputJsonObject {
  return {
    ...(encounter.id ? { id: encounter.id } : {}),
    key: encounter.key,
    title: encounter.title,
    text: encounter.text,
    tone: encounter.tone,
    ...(encounter.status ? { status: encounter.status } : {}),
    effects: { ...encounter.effects },
    ...(encounter.choices ? { choices: encounter.choices.map((choice) => ({
      key: choice.key,
      label: choice.label,
      text: choice.text,
      effects: { ...choice.effects },
    })) as Prisma.InputJsonArray } : {}),
  };
}

async function persistEncounter(input: Pick<ScoutEncounterInput, 'tx' | 'roundPlayerId' | 'now'>, trigger: RandomEncounterTrigger, settlement: EncounterSettlement): Promise<EncounterSettlement> {
  if (!settlement.encounter) return settlement;
  const stored = await input.tx.randomEncounter.create({
    data: {
      roundPlayerId: input.roundPlayerId,
      trigger,
      key: settlement.encounter.key,
      title: settlement.encounter.title,
      text: settlement.encounter.text,
      tone: settlement.encounter.tone,
      status: settlement.encounter.status ?? 'RESOLVED',
      effects: { ...settlement.encounter.effects },
      choices: (settlement.encounter.choices ?? []).map((choice) => ({
        key: choice.key,
        label: choice.label,
        text: choice.text,
        effects: { ...choice.effects },
      })),
      ...(settlement.encounter.status === 'PENDING' ? { expiresAt: new Date(input.now.getTime() + 24 * 60 * 60_000) } : { resolvedAt: input.now }),
    },
  });
  return { ...settlement, encounter: { ...settlement.encounter, id: stored.id } };
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function jsonChoices(value: unknown): NonNullable<RandomEncounterDto['choices']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const choice = object(raw);
    if (!choice || typeof choice.key !== 'string' || typeof choice.label !== 'string') return [];
    return [{
      key: choice.key,
      label: choice.label,
      text: typeof choice.text === 'string' ? choice.text : '',
      effects: cashEffect(choice.effects),
    }];
  });
}

function encounterDefinitionKey(trigger: RandomEncounterTrigger, entryKey: string): string {
  return `${trigger}:${entryKey}`;
}

function firstClassEncounterDto(input: {
  id: string;
  definitionKey: string;
  occurrenceConfig: unknown;
  participationProgress: unknown;
  participationState: unknown;
  pending: boolean;
}): RandomEncounterDto {
  const config = object(input.occurrenceConfig) ?? {};
  const progress = object(input.participationProgress) ?? {};
  const state = object(input.participationState) ?? {};
  const entryKey = typeof config.entryKey === 'string' ? config.entryKey : input.definitionKey.split(':').slice(1).join(':');
  return {
    id: `${FIRST_CLASS_ENCOUNTER_ID_PREFIX}${input.id}`,
    key: entryKey,
    title: typeof config.title === 'string' ? config.title : 'Street encounter',
    text: typeof config.text === 'string' ? config.text : '',
    tone: (typeof config.tone === 'string' ? config.tone : 'neutral') as RandomEncounterDto['tone'],
    status: input.pending ? 'PENDING' : 'RESOLVED',
    effects: cashEffect(progress.effects),
    choices: jsonChoices(state.choices),
  };
}

async function persistFirstClassEncounter(
  input: Pick<ScoutEncounterInput, 'tx' | 'roundPlayerId' | 'now' | 'next'>,
  ruleset: Ruleset,
  trigger: RandomEncounterTrigger,
  entry: RandomEncounterEntryRules,
  settlement: EncounterSettlement,
): Promise<EncounterSettlement> {
  if (!settlement.encounter) return settlement;
  const key = encounterDefinitionKey(trigger, entry.key);
  const catalogEntry = eventCatalogForRuleset(ruleset).find((candidate) => candidate.type === 'RANDOM_ENCOUNTER' && candidate.key === key);
  if (!catalogEntry) return { next: input.next };
  const player = await input.tx.roundPlayer.findUnique({ where: { id: input.roundPlayerId }, select: { roundId: true } });
  const definition = await input.tx.gameEventDefinition.upsert({
    where: { rulesetId_rulesetVersion_key: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, key } },
    create: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key,
      type: 'RANDOM_ENCOUNTER',
      scope: 'PLAYER',
      title: entry.title,
      description: entry.text,
      schedule: inputJson(catalogEntry.schedule),
      objectives: inputJson([]),
      rewards: inputJson([]),
      config: inputJson(catalogEntry.config),
      sourceKind: 'RANDOM_ENCOUNTER_ENTRY',
      sourceKey: entry.key,
    },
    update: {},
    select: { id: true },
  });

  // The action transaction and this unique receipt share the same source key.
  // Replaying an action can therefore never apply its encounter twice.
  const sourceKey = `encounter:${input.roundPlayerId}:${trigger}:${input.now.getTime()}`;
  const pending = settlement.encounter.status === 'PENDING';
  const occurrence = await input.tx.gameEventOccurrence.upsert({
    where: { definitionId_occurrenceKey: { definitionId: definition.id, occurrenceKey: sourceKey } },
    create: {
      definitionId: definition.id,
      ...(player?.roundId ? { roundId: player.roundId } : {}),
      occurrenceKey: sourceKey,
      scopeKey: input.roundPlayerId,
      status: pending ? 'ACTIVE' : 'COMPLETED',
      startsAt: input.now,
      createdAt: input.now,
      endsAt: pending ? new Date(input.now.getTime() + 24 * 60 * 60_000) : input.now,
      activatedAt: input.now,
      ...(pending ? {} : { completedAt: input.now }),
      config: inputJson({
        entryKey: entry.key,
        trigger,
        title: settlement.encounter.title,
        text: settlement.encounter.text,
        tone: settlement.encounter.tone,
        effects: settlement.encounter.effects,
      }),
    },
    update: {},
    select: { id: true },
  });
  const participation = await input.tx.gameEventParticipation.upsert({
    where: { occurrenceId_roundPlayerId: { occurrenceId: occurrence.id, roundPlayerId: input.roundPlayerId } },
    create: {
      occurrenceId: occurrence.id,
      roundPlayerId: input.roundPlayerId,
      status: pending ? 'OFFERED' : 'COMPLETED',
      progress: inputJson({ effects: settlement.encounter.effects }),
      state: inputJson({ trigger, choices: settlement.encounter.choices ?? [], sourceKey }),
      ...(pending ? {} : { completedAt: input.now }),
    },
    update: {},
    select: { id: true },
  });
  const receipt = await input.tx.gameEventProgressReceipt.createMany({
    data: [{ participationId: participation.id, sourceKey, objectiveKey: 'TRIGGERED', payload: inputJson({ trigger, entryKey: entry.key }), recordedAt: input.now }],
    skipDuplicates: true,
  });
  if (receipt.count === 0) return { next: input.next };
  if (!pending) {
    await input.tx.gameEventRewardClaim.createMany({
      data: [{ participationId: participation.id, rewardKey: 'settlement', idempotencyKey: `encounter:${participation.id}:settlement`, reward: inputJson(settlement.encounter.effects), claimedAt: input.now }],
      skipDuplicates: true,
    });
  }
  await input.tx.gameEventHistory.createMany({
    data: [
      { occurrenceId: occurrence.id, participationId: participation.id, action: 'ACTIVATED', dedupeKey: `encounter:${occurrence.id}:activated`, happenedAt: input.now },
      { occurrenceId: occurrence.id, participationId: participation.id, action: pending ? 'OFFERED' : 'SETTLED', dedupeKey: `encounter:${occurrence.id}:${pending ? 'offered' : 'settled'}`, payload: inputJson({ trigger, entryKey: entry.key, effects: settlement.encounter.effects }), happenedAt: input.now },
    ],
    skipDuplicates: true,
  });
  const dto = firstClassEncounterDto({
    id: participation.id,
    definitionKey: key,
    occurrenceConfig: { entryKey: entry.key, title: entry.title, text: entry.text, tone: entry.tone },
    participationProgress: { effects: settlement.encounter.effects },
    participationState: { choices: settlement.encounter.choices ?? [] },
    pending,
  });
  return { next: settlement.next, encounter: dto };
}

async function recentFirstClassEncounterKeys(
  input: Pick<ScoutEncounterInput, 'tx' | 'roundPlayerId' | 'now'>,
  trigger: RandomEncounterTrigger,
  minutes: number,
): Promise<Set<string>> {
  if (minutes <= 0) return new Set();
  const rows = await input.tx.gameEventOccurrence.findMany({
    where: {
      scopeKey: input.roundPlayerId,
      createdAt: { gte: new Date(input.now.getTime() - minutes * 60_000) },
      definition: { is: { type: 'RANDOM_ENCOUNTER', key: { startsWith: `${trigger}:` } } },
    },
    select: { definition: { select: { key: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return new Set(rows.map((row) => row.definition.key));
}

async function rollFirstClassEncounter(input: ActionEncounterInput & { district?: DistrictKey }, triggerKey: RandomEncounterTrigger): Promise<EncounterSettlement> {
  if (!input.ruleset.randomEncounters?.enabled) return { next: input.next };
  const trigger = input.ruleset.randomEncounters?.triggers[triggerKey];
  if (!trigger || !trigger.enabled || input.turns < (trigger.minTurns ?? 1)) return { next: input.next };
  const recentAny = await recentFirstClassEncounterKeys(input, triggerKey, trigger.cooldownMinutes ?? 0);
  if (recentAny.size > 0) return { next: input.next };
  const recentKeys = await recentFirstClassEncounterKeys(input, triggerKey, trigger.perKeyCooldownMinutes ?? 0);
  const rng = input.rng ?? Math.random;
  if (rng() >= triggerChance(trigger, input.turns)) return { next: input.next };
  const eligible = trigger.entries.filter((entry) =>
    (!entry.districts || !input.district || entry.districts.includes(input.district))
    && !recentKeys.has(encounterDefinitionKey(triggerKey, entry.key)),
  );
  const picked = pickWeighted(eligible, rng);
  return picked
    ? persistFirstClassEncounter(input, input.ruleset, triggerKey, picked, settle(picked, input.next, rng))
    : { next: input.next };
}

async function rollActionTrigger(input: ActionEncounterInput, triggerKey: RandomEncounterTrigger): Promise<EncounterSettlement> {
  const trigger = input.ruleset.randomEncounters?.triggers[triggerKey];
  if (!input.ruleset.randomEncounters?.enabled || !trigger?.enabled) return { next: input.next };
  if (input.turns < (trigger.minTurns ?? 1)) return { next: input.next };

  const rng = input.rng ?? Math.random;
  const recentAny = trigger.cooldownMinutes
    ? await recentEncounterKeys(input, triggerKey, trigger.cooldownMinutes)
    : new Set<string>();
  if (recentAny.size > 0) return { next: input.next };

  const recentKeys = trigger.perKeyCooldownMinutes
    ? await recentEncounterKeys(input, triggerKey, trigger.perKeyCooldownMinutes)
    : new Set<string>();
  if (rng() >= triggerChance(trigger, input.turns)) return { next: input.next };

  const eligible = trigger.entries.filter((entry) => !recentKeys.has(entry.key));
  const picked = pickWeighted(eligible, rng);
  return picked ? persistEncounter(input, triggerKey, settle(picked, input.next, rng)) : { next: input.next };
}

export const RandomEncounterService = {
  async pendingForPlayer(prisma: PrismaClient | Db, roundPlayerId: string, now = new Date(), ruleset?: Ruleset): Promise<RandomEncounterDto[]> {
    const player = await prisma.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: { round: { select: { pausedAt: true } } },
    });
    const firstClassMode = Boolean(ruleset && usesFirstClassRandomEncounters(ruleset));
    const rows = firstClassMode ? [] : await prisma.randomEncounter.findMany({
      where: {
        roundPlayerId,
        status: 'PENDING',
        ...(!player?.round.pausedAt ? {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const firstClassRows = firstClassMode && prisma.gameEventParticipation?.findMany ? await prisma.gameEventParticipation.findMany({
      where: {
        roundPlayerId,
        status: 'OFFERED',
        occurrence: {
          definition: { is: { type: 'RANDOM_ENCOUNTER' } },
          ...(!player?.round.pausedAt ? { OR: [{ endsAt: null }, { endsAt: { gt: now } }] } : {}),
        },
      },
      select: {
        id: true,
        progress: true,
        state: true,
        occurrence: {
          select: {
            config: true,
            definition: { select: { key: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }) : [];
    return [
      ...firstClassRows.map((row) => firstClassEncounterDto({
        id: row.id,
        definitionKey: row.occurrence.definition.key,
        occurrenceConfig: row.occurrence.config,
        participationProgress: row.progress,
        participationState: row.state,
        pending: true,
      })),
      ...rows.map(toRandomEncounterDto),
    ].slice(0, 5);
  },

  async scout(input: ScoutEncounterInput): Promise<EncounterSettlement> {
    if (usesFirstClassRandomEncounters(input.ruleset)) return rollFirstClassEncounter(input, 'SCOUT');
    const trigger = input.ruleset.randomEncounters?.triggers.SCOUT;
    if (!input.ruleset.randomEncounters?.enabled || !trigger?.enabled) return { next: input.next };
    if (input.turns < (trigger.minTurns ?? 1)) return { next: input.next };

    const rng = input.rng ?? Math.random;
    const recentAny = trigger.cooldownMinutes
      ? await recentEncounterKeys(input, 'SCOUT', trigger.cooldownMinutes)
      : new Set<string>();
    if (recentAny.size > 0) return { next: input.next };

    const recentKeys = trigger.perKeyCooldownMinutes
      ? await recentEncounterKeys(input, 'SCOUT', trigger.perKeyCooldownMinutes)
      : new Set<string>();

    if (rng() >= triggerChance(trigger, input.turns)) return { next: input.next };

    const eligible = trigger.entries.filter((entry) =>
      (!entry.districts || entry.districts.includes(input.district)) &&
      !recentKeys.has(entry.key),
    );
    const picked = pickWeighted(eligible, rng);
    return picked ? persistEncounter(input, 'SCOUT', settle(picked, input.next, rng)) : { next: input.next };
  },

  async produce(input: ProduceEncounterInput): Promise<EncounterSettlement> {
    if (usesFirstClassRandomEncounters(input.ruleset)) return rollFirstClassEncounter(input, 'PRODUCE');
    const trigger = input.ruleset.randomEncounters?.triggers.PRODUCE;
    if (!input.ruleset.randomEncounters?.enabled || !trigger?.enabled) return { next: input.next };
    if (input.turns < (trigger.minTurns ?? 1)) return { next: input.next };

    const rng = input.rng ?? Math.random;
    const recentAny = trigger.cooldownMinutes
      ? await recentEncounterKeys(input, 'PRODUCE', trigger.cooldownMinutes)
      : new Set<string>();
    if (recentAny.size > 0) return { next: input.next };

    const recentKeys = trigger.perKeyCooldownMinutes
      ? await recentEncounterKeys(input, 'PRODUCE', trigger.perKeyCooldownMinutes)
      : new Set<string>();

    if (rng() >= triggerChance(trigger, input.turns)) return { next: input.next };

    const eligible = trigger.entries.filter((entry) => !recentKeys.has(entry.key));
    const picked = pickWeighted(eligible, rng);
    return picked ? persistEncounter(input, 'PRODUCE', settle(picked, input.next, rng)) : { next: input.next };
  },

  async action(input: ActionEncounterInput, trigger: Extract<RandomEncounterTrigger, 'STORE' | 'TURF' | 'COMBAT'>): Promise<EncounterSettlement> {
    if (usesFirstClassRandomEncounters(input.ruleset)) return rollFirstClassEncounter(input, trigger);
    return rollActionTrigger(input, trigger);
  },

  async travel(input: TravelEncounterInput): Promise<EncounterSettlement> {
    if (usesFirstClassRandomEncounters(input.ruleset)) return rollFirstClassEncounter(input, 'TRAVEL');
    const trigger = input.ruleset.randomEncounters?.triggers.TRAVEL;
    if (!input.ruleset.randomEncounters?.enabled || !trigger?.enabled) return { next: input.next };
    if (input.turns < (trigger.minTurns ?? 1)) return { next: input.next };

    const rng = input.rng ?? Math.random;
    const recentAny = trigger.cooldownMinutes
      ? await recentEncounterKeys(input, 'TRAVEL', trigger.cooldownMinutes)
      : new Set<string>();
    if (recentAny.size > 0) return { next: input.next };

    const recentKeys = trigger.perKeyCooldownMinutes
      ? await recentEncounterKeys(input, 'TRAVEL', trigger.perKeyCooldownMinutes)
      : new Set<string>();

    if (rng() >= triggerChance(trigger, input.turns)) return { next: input.next };

    const eligible = trigger.entries.filter((entry) => !recentKeys.has(entry.key));
    const picked = pickWeighted(eligible, rng);
    return picked ? persistEncounter(input, 'TRAVEL', settle(picked, input.next, rng)) : { next: input.next };
  },
};
