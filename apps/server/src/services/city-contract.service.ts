import type { Prisma } from '@prisma/client';
import {
  cityRules,
  eventAt,
  fillMarket,
  hashRoll,
  marketView,
  supplyAt,
} from '@streets/rules-engine';
import type {
  QuestDefinition,
  QuestObjectiveDefinition,
  QuestRewardDefinition,
  Ruleset,
  SupplyLevel,
} from '@streets/rulesets';
import type { Db } from '../utils/db.js';

export const CITY_CONTRACT_SLOTS = 2;
export const CITY_CONTRACT_WINDOW_HOURS = 12;
export const CITY_CONTRACT_PAYOUT_MULTIPLIER = 1.35;

const WINDOW_MS = CITY_CONTRACT_WINDOW_HOURS * 60 * 60 * 1000;

const SUPPLY_PRESSURE: Readonly<Record<SupplyLevel, number>> = {
  PLENTIFUL: -2,
  NORMAL: 1,
  LOW: 4,
  OUT: 6,
};

export interface CityContractWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface CityContractState {
  windowStart: string;
  windowEnd: string;
  city: string;
  cityName: string;
  product: string;
  productName: string;
  condition: string;
  title: string;
  description: string;
  target: number;
  expectedUnitCents: number;
  expectedSaleCents: number;
  bonusCents: number;
  payoutMultiplier: number;
}

type Opportunity = CityContractState & { score: number };

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function cityContractWindow(now = new Date()): CityContractWindow {
  const startMs = Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS;
  return {
    startsAt: new Date(startMs),
    endsAt: new Date(startMs + WINDOW_MS),
  };
}

export function isDynamicCityContractDefinition(
  definition: QuestDefinition | undefined,
): definition is QuestDefinition & { availability: QuestDefinition['availability'] & { dynamicCityContract: true; slot?: number } } {
  return Boolean(definition?.availability.dynamicCityContract === true);
}

export function cityContractState(value: unknown): CityContractState | null {
  const outer = record(value);
  const raw = record(outer?.cityContract);
  if (!raw) return null;

  const requiredStrings = [
    'windowStart',
    'windowEnd',
    'city',
    'cityName',
    'product',
    'productName',
    'condition',
    'title',
    'description',
  ] as const;
  if (requiredStrings.some((key) => typeof raw[key] !== 'string')) return null;
  const requiredNumbers = [
    'target',
    'expectedUnitCents',
    'expectedSaleCents',
    'bonusCents',
    'payoutMultiplier',
  ] as const;
  if (requiredNumbers.some((key) => typeof raw[key] !== 'number' || !Number.isFinite(raw[key] as number))) return null;

  return {
    windowStart: raw.windowStart as string,
    windowEnd: raw.windowEnd as string,
    city: raw.city as string,
    cityName: raw.cityName as string,
    product: raw.product as string,
    productName: raw.productName as string,
    condition: raw.condition as string,
    title: raw.title as string,
    description: raw.description as string,
    target: raw.target as number,
    expectedUnitCents: raw.expectedUnitCents as number,
    expectedSaleCents: raw.expectedSaleCents as number,
    bonusCents: raw.bonusCents as number,
    payoutMultiplier: raw.payoutMultiplier as number,
  };
}

export function cityContractObjectives(value: unknown): QuestObjectiveDefinition[] | null {
  const state = cityContractState(value);
  if (!state) return null;
  return [{
    id: 'deliver',
    kind: 'EVENT_SUM',
    description: `Sell ${state.target.toLocaleString('en-US')} ${state.productName} in ${state.cityName}.`,
    target: state.target,
    params: {
      eventTypes: ['RUN_TRADE', 'STORE_SELL'],
      field: 'quantity',
      where: {
        city: state.city,
        product: state.product,
        direction: 'sell',
      },
    },
  }];
}

export function cityContractRewards(value: unknown): QuestRewardDefinition[] | null {
  const state = cityContractState(value);
  if (!state) return null;
  return [{ kind: 'CASH', amount: state.bonusCents }];
}

function conditionFor(
  supply: SupplyLevel | null,
  event: 'GLUT' | 'DROUGHT' | undefined,
  demand: number,
): { label: string; description: string } {
  if (event === 'DROUGHT') {
    return {
      label: 'Drought Order',
      description: 'A live drought event has tightened supply and buyers are paying for incoming product.',
    };
  }
  if (supply === 'OUT') {
    return {
      label: 'Shortage',
      description: 'Local counter supply is exhausted, so incoming product is in short supply.',
    };
  }
  if (supply === 'LOW') {
    return {
      label: 'Thin Supply',
      description: 'Local supply is running thin and the city is looking for more product.',
    };
  }
  if (demand >= 1.1) {
    return {
      label: 'High Demand',
      description: 'Demand is running well above the city baseline.',
    };
  }
  return {
    label: 'Market Order',
    description: 'The city market is posting a short-term order for additional product.',
  };
}

function targetFor(supply: SupplyLevel | null, event: 'GLUT' | 'DROUGHT' | undefined, demand: number): number {
  if (event === 'DROUGHT' || supply === 'OUT') return 750;
  if (supply === 'LOW' || demand >= 1.1) return 500;
  return 250;
}

export function cityContractOffers(
  ruleset: Ruleset,
  roundSeed: string,
  window: CityContractWindow,
): CityContractState[] {
  const cities = Object.keys(ruleset.cities ?? {});
  const products = Object.keys(ruleset.products ?? {});
  if (!cities.length || !products.length || !ruleset.travel?.market) return [];

  const sampleAt = new Date(window.startsAt.getTime() + 1);
  const candidates: Opportunity[] = [];

  for (const city of cities) {
    const cityRule = cityRules(ruleset, city);
    if (!cityRule) continue;

    for (const product of products) {
      const productRule = cityRule.products[product];
      const productDefinition = ruleset.products?.[product];
      if (!productRule || !productDefinition) continue;

      const supply = supplyAt(ruleset, roundSeed, city, product, sampleAt);
      const event = eventAt(ruleset, roundSeed, city, product, sampleAt)?.kind;
      const market = marketView(ruleset, roundSeed, city, product, 0, sampleAt);
      if (!market || market.sellCents <= 0) continue;
      // Null means this counter never carries the product in this city. That is
      // a permanent catalog fact, not a live shortage, so it cannot drive S.
      if (supply === null) continue;

      // Gluts are the opposite of a shortage contract. They stay eligible only
      // when unusually strong demand still makes the city worth supplying.
      if (event === 'GLUT' && productRule.demand < 1.1) continue;

      const supplyPressure = SUPPLY_PRESSURE[supply];
      const eventPressure = event === 'DROUGHT' ? 4 : event === 'GLUT' ? -4 : 0;
      const demandPressure = Math.max(0, (productRule.demand - 0.6) * 5);
      const tieBreak = hashRoll(roundSeed, 'city-contract', window.startsAt.toISOString(), city, product) * 0.25;
      const score = supplyPressure + eventPressure + demandPressure + tieBreak;

      const target = targetFor(supply, event, productRule.demand);
      const expectedSaleCents = Number(fillMarket(
        market,
        ruleset.travel.market,
        'sell',
        target,
      ).totalCents);
      const bonusCents = Math.max(1, Math.round(expectedSaleCents * (CITY_CONTRACT_PAYOUT_MULTIPLIER - 1)));
      const cityName = cityRule.name;
      const productName = productDefinition.name;
      const condition = conditionFor(supply, event, productRule.demand);
      const title = `${cityName}: ${productName} ${condition.label}`;
      const description = `${condition.description} Sell ${target.toLocaleString('en-US')} ${productName} in ${cityName} before the 12-hour board refresh. The contract bonus adds 35% of the expected sale value.`;

      candidates.push({
        windowStart: window.startsAt.toISOString(),
        windowEnd: window.endsAt.toISOString(),
        city,
        cityName,
        product,
        productName,
        condition: condition.label,
        title,
        description,
        target,
        expectedUnitCents: market.sellCents,
        expectedSaleCents,
        bonusCents,
        payoutMultiplier: CITY_CONTRACT_PAYOUT_MULTIPLIER,
        score,
      });
    }
  }

  return candidates
    .sort((left, right) =>
      right.score - left.score
      || left.city.localeCompare(right.city)
      || left.product.localeCompare(right.product)
    )
    .slice(0, CITY_CONTRACT_SLOTS)
    .map(({ score: _score, ...offer }) => offer);
}

export async function syncCityContractAttempts(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  now = new Date(),
): Promise<string[]> {
  const templates = Object.values(ruleset.questDefinitions ?? {})
    .filter(isDynamicCityContractDefinition)
    .sort((left, right) => Number(left.availability.slot ?? 0) - Number(right.availability.slot ?? 0));
  if (!templates.length) return [];

  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { roundId: true },
  });
  if (!player) return [];

  const definitionRows = await db.questDefinition.findMany({
    where: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key: { in: templates.map((definition) => definition.key) },
      isEnabled: true,
    },
  });
  if (!definitionRows.length) return [];

  const window = cityContractWindow(now);
  const offers = cityContractOffers(ruleset, player.roundId, window);
  if (!offers.length) return [];

  await db.playerQuest.updateMany({
    where: {
      roundPlayerId,
      questDefinitionId: { in: definitionRows.map((definition) => definition.id) },
      status: { in: ['AVAILABLE', 'ACTIVE', 'READY_TO_TURN_IN'] },
      expiresAt: { not: null, lte: now },
    },
    data: { status: 'EXPIRED', isTracked: false },
  });

  const existing = await db.playerQuest.findMany({
    where: {
      roundPlayerId,
      questDefinitionId: { in: definitionRows.map((definition) => definition.id) },
    },
    include: { questDefinition: true },
    orderBy: { attempt: 'desc' },
  });

  const created: string[] = [];
  for (let index = 0; index < Math.min(templates.length, offers.length); index += 1) {
    const template = templates[index]!;
    const offer = offers[index]!;
    const definitionRow = definitionRows.find((row) => row.key === template.key);
    if (!definitionRow) continue;

    const sameWindow = existing.find((row) =>
      row.questDefinitionId === definitionRow.id
      && cityContractState(row.rewardState)?.windowStart === offer.windowStart
    );
    if (sameWindow) continue;

    const attempt = Math.max(
      0,
      ...existing
        .filter((row) => row.questDefinitionId === definitionRow.id)
        .map((row) => row.attempt),
    ) + 1;

    await db.playerQuest.create({
      data: {
        roundPlayerId,
        questDefinitionId: definitionRow.id,
        attempt,
        status: 'AVAILABLE',
        expiresAt: window.endsAt,
        rewardState: inputJson({ cityContract: offer }),
      },
    });
    created.push(template.key);
  }

  return created;
}
