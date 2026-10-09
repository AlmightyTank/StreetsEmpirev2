import type { Prisma, PrismaClient, RandomEncounter } from '@prisma/client';
import type { DistrictKey, RandomEncounterEntryRules, RandomEncounterTrigger, Ruleset } from '@streets/rulesets';
import type { RandomEncounterDto } from '@streets/shared';
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

export const RandomEncounterService = {
  async pendingForPlayer(prisma: PrismaClient | Db, roundPlayerId: string, now = new Date()): Promise<RandomEncounterDto[]> {
    const rows = await prisma.randomEncounter.findMany({
      where: {
        roundPlayerId,
        status: 'PENDING',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    return rows.map(toRandomEncounterDto);
  },

  async scout(input: ScoutEncounterInput): Promise<EncounterSettlement> {
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

    if (rng() >= trigger.chance) return { next: input.next };

    const eligible = trigger.entries.filter((entry) =>
      (!entry.districts || entry.districts.includes(input.district)) &&
      !recentKeys.has(entry.key),
    );
    const picked = pickWeighted(eligible, rng);
    return picked ? persistEncounter(input, 'SCOUT', settle(picked, input.next, rng)) : { next: input.next };
  },

  async produce(input: ProduceEncounterInput): Promise<EncounterSettlement> {
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

    if (rng() >= trigger.chance) return { next: input.next };

    const eligible = trigger.entries.filter((entry) => !recentKeys.has(entry.key));
    const picked = pickWeighted(eligible, rng);
    return picked ? persistEncounter(input, 'PRODUCE', settle(picked, input.next, rng)) : { next: input.next };
  },

  async travel(input: TravelEncounterInput): Promise<EncounterSettlement> {
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

    if (rng() >= trigger.chance) return { next: input.next };

    const eligible = trigger.entries.filter((entry) => !recentKeys.has(entry.key));
    const picked = pickWeighted(eligible, rng);
    return picked ? persistEncounter(input, 'TRAVEL', settle(picked, input.next, rng)) : { next: input.next };
  },
};
