import type { PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type {
  ProfitClassification,
  ProfitIntelligenceCityTotalDto,
  ProfitIntelligenceDaySourceCityDto,
  ProfitIntelligenceDto,
  ProfitComparisonDto,
  ProfitIntelligenceGoalsDto,
  UpdateProfitIntelligenceGoalsInput,
  ProfitIntelligenceSourceTotalDto,
  ProfitIntelligenceTotalsDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { productKeys } from './product-inventory.service.js';

export const PROFIT_CLASSIFICATION_VERSION = '2.6.0-B1' as const;
export const MAX_PROFIT_REPORT_DAYS = 90;
const DAY_MS = 86_400_000;

const SOURCE_CLASSIFICATION: Readonly<Record<string, ProfitClassification>> = {
  BUSINESS_INCOME: 'OPERATING_INCOME', TURF_TAX: 'OPERATING_INCOME', DEALER_SALES: 'OPERATING_INCOME',
  DEALER_WAGES: 'OPERATING_COST', SUPPLY_LANE_FEE: 'OPERATING_COST', SUPPLY_UPKEEP: 'OPERATING_COST',
  RUN_INCIDENT: 'FINES_AND_FEES', RUN_HOTEL: 'OPERATING_COST', TRIP_AIRPORT: 'FINES_AND_FEES',
  WARRANT: 'FINES_AND_FEES', LAWYER: 'OPERATING_COST', HEAT_BRIBE: 'FINES_AND_FEES',
  SUPPLY_ORDER: 'INVENTORY_PURCHASE', STORE_BUY: 'MIXED', STORE_SELL: 'INVENTORY_PROCEEDS',
  BUSINESS_BUILD: 'ASSET_PURCHASE', SUPPLY_PROPERTY: 'ASSET_PURCHASE', HIDEOUT_UPGRADE: 'ASSET_PURCHASE',
  LOAN_PROCEEDS: 'FINANCING_PROCEEDS', LOAN_PRINCIPAL: 'FINANCING_REPAYMENT', LOAN_COLLECTION: 'FINANCING_REPAYMENT',
  LOAN_CONTRACT_FEE: 'FINANCING_COST', LOAN_LATE_FEE: 'FINANCING_COST',
  RUN_LAUNCH: 'MIXED', TURF_OUTPOST_TRANSFER: 'INTERNAL_TRANSFER',
  RAID: 'PLAYER_TRANSFER', CONVOY_ATTACK: 'PLAYER_TRANSFER', CONVOY_DEFENSE: 'PLAYER_TRANSFER',
  BOSS_HIT_ATTACK: 'PLAYER_TRANSFER', BOSS_HIT_DEFENSE: 'PLAYER_TRANSFER',
  TURF_PUSH_ATTACK: 'PLAYER_TRANSFER', TURF_PUSH_DEFENSE: 'PLAYER_TRANSFER',
  BLOCK_WAR_CUT: 'INTERNAL_TRANSFER', OPERATION_COST: 'MIXED', OPERATION_REFUND: 'REVERSAL',
  OPERATION_PAYOUT: 'REWARD', LIVING_CASE_REWARD: 'REWARD', STREET_PASS_CLAIM: 'REWARD',
  SURVEY_COMPLETE: 'REWARD', RING_DESTROY: 'REWARD', BUSINESS_TORCH: 'ASSET_RECOVERY',
  RANDOM_ENCOUNTER: 'MIXED', BATTLE_VOIDED: 'CORRECTION',
};

export interface RawProfitGroup {
  source: string;
  day: string;
  citySlug: string | null;
  entryCount: string;
  inflowCents: string;
  outflowCents: string;
  netCents: string;
}
export interface ProfitLedgerSummary { entryCount: number; netCents: bigint }
type MutableTotals = { entryCount: number; inflow: bigint; outflow: bigint; net: bigint };

export function profitClassificationForSource(source: string): ProfitClassification {
  return SOURCE_CLASSIFICATION[source] ?? 'UNKNOWN';
}
function goalMoney(cents: bigint): string {
  const sign = cents < 0n ? '−' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}$${(absolute / 100n).toLocaleString('en-US')}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
function emptyTotals(): MutableTotals { return { entryCount: 0, inflow: 0n, outflow: 0n, net: 0n }; }
function addGroup(target: MutableTotals, group: { entryCount: number | string; inflowCents: string; outflowCents: string; netCents: string }): void {
  target.entryCount += Number(group.entryCount);
  target.inflow += BigInt(group.inflowCents);
  target.outflow += BigInt(group.outflowCents);
  target.net += BigInt(group.netCents);
}
function totalsDto(value: MutableTotals): ProfitIntelligenceTotalsDto {
  return { entryCount: value.entryCount, inflowCents: value.inflow.toString(), outflowCents: value.outflow.toString(), netCents: value.net.toString() };
}

export function projectProfitGroups(input: {
  groups: readonly RawProfitGroup[];
  ledger: ProfitLedgerSummary;
  ruleset: Ruleset;
  roundId: string;
  generatedAt: Date;
  period: { from: Date; to: Date; days: number };
}): ProfitIntelligenceDto {
  const normalized = new Map<string, ProfitIntelligenceDaySourceCityDto>();
  for (const row of input.groups) {
    const citySlug = row.citySlug && input.ruleset.cities?.[row.citySlug] ? row.citySlug : null;
    const key = [row.day, row.source, citySlug ?? ''].join('|');
    const existing = normalized.get(key);
    const total = existing
      ? { entryCount: existing.entryCount, inflow: BigInt(existing.inflowCents), outflow: BigInt(existing.outflowCents), net: BigInt(existing.netCents) }
      : emptyTotals();
    addGroup(total, row);
    normalized.set(key, {
      day: row.day, source: row.source, classification: profitClassificationForSource(row.source),
      citySlug, cityName: citySlug ? input.ruleset.cities?.[citySlug]?.name ?? citySlug : null,
      attribution: citySlug ? 'KNOWN_CITY' as const : 'UNKNOWN_CITY' as const, ...totalsDto(total),
    });
  }

  const bySourceMap = new Map<string, MutableTotals>();
  const byCityMap = new Map<string, MutableTotals>();
  const buckets = [...normalized.values()].sort((a, b) => a.day.localeCompare(b.day) || a.source.localeCompare(b.source) || (a.citySlug ?? '').localeCompare(b.citySlug ?? ''));
  for (const bucket of buckets) {
    const sourceTotal = bySourceMap.get(bucket.source) ?? emptyTotals();
    addGroup(sourceTotal, bucket);
    bySourceMap.set(bucket.source, sourceTotal);
    const cityKey = bucket.citySlug ?? '';
    const cityTotal = byCityMap.get(cityKey) ?? emptyTotals();
    addGroup(cityTotal, bucket);
    byCityMap.set(cityKey, cityTotal);
  }

  const bySource: ProfitIntelligenceSourceTotalDto[] = [...bySourceMap.entries()]
    .map(([source, value]) => ({ source, classification: profitClassificationForSource(source), ...totalsDto(value) }))
    .sort((a, b) => a.source.localeCompare(b.source));

  const recognizedIncome = bySource.reduce((sum, row) =>
    row.classification === 'OPERATING_INCOME' || row.classification === 'INVENTORY_PROCEEDS'
      ? sum + BigInt(row.netCents) : sum, 0n);
  const recognizedCosts = bySource.reduce((sum, row) =>
    row.classification === 'OPERATING_COST' || row.classification === 'FINES_AND_FEES'
      ? sum + BigInt(row.outflowCents) - BigInt(row.inflowCents) : sum, 0n);
  const dealerNetSales = BigInt(bySource.find((row) => row.source === 'DEALER_SALES')?.netCents ?? '0');
  const dealerWages = BigInt(bySource.find((row) => row.source === 'DEALER_WAGES')?.outflowCents ?? '0');
  const salesToWagesRatio = dealerWages > 0n
    ? (() => {
      const hundredths = (dealerNetSales * 100n + dealerWages / 2n) / dealerWages;
      return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}`;
    })()
    : null;

  const byCity: ProfitIntelligenceCityTotalDto[] = [...byCityMap.entries()]
    .map(([citySlug, value]): ProfitIntelligenceCityTotalDto => ({
      citySlug: citySlug || null,
      cityName: citySlug ? input.ruleset.cities?.[citySlug]?.name ?? citySlug : null,
      attribution: citySlug ? 'KNOWN_CITY' : 'UNKNOWN_CITY',
      ...totalsDto(value),
    }))
    .sort((a, b) => (a.citySlug ?? '').localeCompare(b.citySlug ?? ''));

  const projected = buckets.reduce((sum, row) => ({ count: sum.count + row.entryCount, net: sum.net + BigInt(row.netCents) }), { count: 0, net: 0n });
  const inflow = buckets.reduce((sum, row) => sum + BigInt(row.inflowCents), 0n);
  const outflow = buckets.reduce((sum, row) => sum + BigInt(row.outflowCents), 0n);
  const variance = projected.net - input.ledger.netCents;
  const unknownSourceEntries = buckets.reduce((sum, row) => sum + (row.classification === 'UNKNOWN' ? row.entryCount : 0), 0);
  const unattributedCityEntries = buckets.reduce((sum, row) => sum + (row.attribution === 'UNKNOWN_CITY' ? row.entryCount : 0), 0);

  return {
    classificationVersion: PROFIT_CLASSIFICATION_VERSION,
    reportVersion: '2.6.0-C1',
    roundId: input.roundId,
    generatedAt: input.generatedAt.toISOString(),
    period: { from: input.period.from.toISOString(), to: input.period.to.toISOString(), days: input.period.days },
    totals: totalsDto({ entryCount: projected.count, inflow, outflow, net: projected.net }),
    bySource, byCity, byDaySourceCity: buckets,
    reconciliation: {
      ledgerEntryCount: input.ledger.entryCount, projectedEntryCount: projected.count,
      ledgerNetCents: input.ledger.netCents.toString(), projectedNetCents: projected.net.toString(),
      varianceCents: variance.toString(),
      matches: input.ledger.entryCount === projected.count && variance === 0n,
    },
    dataQuality: { unknownSourceEntries, unattributedCityEntries },
    profitEstimate: {
      basis: 'KNOWN_LEDGER_CASH_MARGIN', completeness: 'INCOMPLETE',
      recognizedIncomeCents: recognizedIncome.toString(), recognizedCostsCents: recognizedCosts.toString(),
      estimatedNetCents: (recognizedIncome - recognizedCosts).toString(),
      notes: [
        'This is a known cash-margin estimate, not complete realized profit.',
        'Inventory acquisition cost is not matched to stock sold, so inventory proceeds are shown without cost of goods sold.',
        'Business income is recorded when collected; uncollected registers and accrued income are excluded.',
        'Refunds recorded against the same recognized source reduce its net contribution.',
        'Asset purchases, financing principal, transfers, rewards, mixed events, and unknown sources are excluded from the estimate.',
      ],
    },
    comparison: emptyProfitComparison(),
    goals: emptyProfitGoals(),
    efficiency: {
      dealerNetSalesCents: dealerNetSales.toString(), dealerWagesCents: dealerWages.toString(),
      salesToWagesRatio, turnEfficiencyAvailable: false,
      turnEfficiencyReason: 'Ledger entries do not consistently record turns consumed for the reporting window.',
    },
  };
}

export function emptyProfitComparison(): ProfitComparisonDto {
  return {
    comparisonVersion: '2.6.0-D1', routes: [], tradeCities: [], currentRegisters: [], observedMarkets: [],
    cashAway: { activeRunCents: '0', activeBossTripCents: '0', totalCents: '0' },
    caveats: [
      'Trade delta is sales proceeds minus purchases made on the recorded trip; it excludes home cargo cost, launch, hotel, incident, vehicle, and other costs.',
      'Business registers and away cash are current balances, not historical balances or earned income.',
      'Market prices are the last observed values and may be stale. They are not forecasts.',
    ],
  };
}

export function projectProfitComparison(input: {
  runs: Array<{ stops: Array<{ order: number; city: string; route: unknown }>; trades: Array<{ city: string; productKey: string; direction: string; totalCents: bigint }> }>;
  businesses: Array<{ registerCents: bigint; turf: { city: { slug: string; name: string } } }>;
  sightings: Array<{ city: string; seenAt: Date; counter: unknown }>;
  activeRuns: Array<{ cashCents: bigint }>;
  activeBossTrips: Array<{ bankrollCents: bigint }>;
  cityNames: Record<string, string>;
}): ProfitComparisonDto {
  const routes = new Map<string, { route: string[]; tripCount: number; buy: bigint; sell: bigint }>();
  const tradeCities = new Map<string, { buy: bigint; sell: bigint }>();
  for (const run of input.runs) {
    const ordered = [...run.stops].sort((a, b) => a.order - b.order);
    const path: string[] = [];
    for (const stop of ordered) {
      const leg = Array.isArray(stop.route) ? stop.route.filter((city): city is string => typeof city === 'string') : [stop.city];
      for (const city of leg) if (path.at(-1) !== city) path.push(city);
    }
    const key = path.join(' → ');
    const aggregate = routes.get(key) ?? { route: path, tripCount: 0, buy: 0n, sell: 0n };
    aggregate.tripCount++;
    for (const trade of run.trades) {
      if (trade.direction === 'buy') aggregate.buy += trade.totalCents;
      if (trade.direction === 'sell') aggregate.sell += trade.totalCents;
      const city = tradeCities.get(trade.city) ?? { buy: 0n, sell: 0n };
      if (trade.direction === 'buy') city.buy += trade.totalCents;
      if (trade.direction === 'sell') city.sell += trade.totalCents;
      tradeCities.set(trade.city, city);
    }
    routes.set(key, aggregate);
  }
  const sightings = input.sightings.map((sighting) => {
    const value = sighting.counter as { products?: Array<{ key?: string; market?: { buyCents?: number; sellCents?: number; depth?: number } }> } | null;
    return {
      citySlug: sighting.city, cityName: input.cityNames[sighting.city] ?? sighting.city,
      seenAt: sighting.seenAt.toISOString(),
      products: (Array.isArray(value?.products) ? value.products : []).flatMap((product) =>
        product.key && Number.isFinite(product.market?.buyCents) && Number.isFinite(product.market?.sellCents)
          ? [{ productKey: product.key, buyCents: product.market!.buyCents!, sellCents: product.market!.sellCents!, depth: Number.isFinite(product.market?.depth) ? product.market!.depth! : null }]
          : []),
    };
  });
  const awayRun = input.activeRuns.reduce((sum, row) => sum + row.cashCents, 0n);
  const awayBoss = input.activeBossTrips.reduce((sum, row) => sum + row.bankrollCents, 0n);
  return {
    comparisonVersion: '2.6.0-D1',
    routes: [...routes.values()].map((row) => ({ route: row.route, tripCount: row.tripCount, buyCents: row.buy.toString(), sellCents: row.sell.toString(), tradeDeltaCents: (row.sell - row.buy).toString() })).sort((a, b) => b.tripCount - a.tripCount || a.route.join().localeCompare(b.route.join())),
    tradeCities: [...tradeCities.entries()].map(([citySlug, row]) => ({ citySlug, cityName: input.cityNames[citySlug] ?? citySlug, buyCents: row.buy.toString(), sellCents: row.sell.toString(), tradeDeltaCents: (row.sell - row.buy).toString() })).sort((a, b) => a.cityName.localeCompare(b.cityName)),
    currentRegisters: [...input.businesses.reduce((map, row) => map.set(row.turf.city.slug, (map.get(row.turf.city.slug) ?? 0n) + row.registerCents), new Map<string, bigint>()).entries()].map(([citySlug, total]) => ({ citySlug, cityName: input.cityNames[citySlug] ?? citySlug, registerCents: total.toString() })).sort((a, b) => a.cityName.localeCompare(b.cityName)),
    observedMarkets: sightings,
    cashAway: { activeRunCents: awayRun.toString(), activeBossTripCents: awayBoss.toString(), totalCents: (awayRun + awayBoss).toString() },
    caveats: [
      'Trade delta is sales proceeds minus purchases made on the recorded trip; it excludes home cargo cost, launch, hotel, incident, vehicle, and other costs.',
      'Business registers and away cash are current balances, not historical balances or earned income.',
      'Market prices are the last observed values and may be stale. They are not forecasts.',
    ],
  };
}


export function emptyProfitGoals(): ProfitIntelligenceGoalsDto {
  return {
    availableProductKeys: [],
    settings: { minimumLiquidityCents: null, minimumProductKey: null, minimumProductUnits: null, maximumRoutePurchaseCents: null },
    observed: { liquidityCents: '0', minimumProductUnits: null, maximumRoutePurchaseCents: null },
    warnings: [],
  };
}

export function projectProfitGoals(input: {
  settings: ProfitIntelligenceGoalsDto['settings'];
  liquidityCents: bigint;
  productUnits: number | null;
  routePurchases: Array<{ route: string[]; buyCents: string }>;
}): ProfitIntelligenceGoalsDto {
  const warnings: string[] = [];
  if (input.settings.minimumLiquidityCents !== null && input.liquidityCents < BigInt(input.settings.minimumLiquidityCents)) {
    warnings.push(`Liquidity is below your ${goalMoney(BigInt(input.settings.minimumLiquidityCents))} minimum.`);
  }
  if (input.settings.minimumProductKey && input.settings.minimumProductUnits !== null
      && input.productUnits !== null && input.productUnits < input.settings.minimumProductUnits) {
    warnings.push(`${input.settings.minimumProductKey} stock is below your ${input.settings.minimumProductUnits}-unit minimum.`);
  }
  const routeLimit = input.settings.maximumRoutePurchaseCents === null ? null : BigInt(input.settings.maximumRoutePurchaseCents);
  const highestRoute = input.routePurchases.reduce<{ cents: bigint; name: string } | null>((best, row) => {
    const cents = BigInt(row.buyCents);
    return !best || cents > best.cents ? { cents, name: row.route.join(' → ') || 'Recorded route' } : best;
  }, null);
  if (routeLimit !== null && highestRoute && highestRoute.cents > routeLimit) {
    warnings.push(`${highestRoute.name} purchases exceeded your ${goalMoney(routeLimit)} route limit in this report window.`);
  }
  return {
    availableProductKeys: [],
    settings: input.settings,
    observed: {
      liquidityCents: input.liquidityCents.toString(),
      minimumProductUnits: input.productUnits,
      maximumRoutePurchaseCents: highestRoute?.cents.toString() ?? null,
    },
    warnings,
  };
}

export const ProfitIntelligenceService = {
  async get(prisma: PrismaClient, input: {
    roundId: string; roundPlayerId: string; roundStartsAt: Date; ruleset: Ruleset; days: number; now?: Date;
  }): Promise<ProfitIntelligenceDto> {
    const now = input.now ?? new Date();
    if (!Number.isSafeInteger(input.days) || input.days < 1 || input.days > MAX_PROFIT_REPORT_DAYS) {
      throw AppError.badRequest('INVALID_REPORT_PERIOD', 'Choose a report window from 1 to 90 days.');
    }
    const requestedFrom = new Date(now.getTime() - input.days * DAY_MS);
    const from = requestedFrom < input.roundStartsAt ? input.roundStartsAt : requestedFrom;
    const period = { from: from > now ? now : from, to: now, days: input.days };

    return prisma.$transaction(async (tx) => {
      const where = { roundPlayerId: input.roundPlayerId, createdAt: { gte: period.from, lt: period.to } };
      const [groups, aggregate, runs, businesses, sightings, activeRuns, activeBossTrips, playerCash, goalRow, warehouseStock, dealerStock] = await Promise.all([
        tx.$queryRaw<RawProfitGroup[]>`
          SELECT
            "source",
            TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS "day",
            CASE WHEN jsonb_typeof("metadata") = 'object' THEN NULLIF("metadata" ->> 'citySlug', '') ELSE NULL END AS "citySlug",
            COUNT(*)::text AS "entryCount",
            COALESCE(SUM(CASE WHEN "amountCents" > 0 THEN "amountCents" ELSE 0::bigint END), 0)::text AS "inflowCents",
            COALESCE(SUM(CASE WHEN "amountCents" < 0 THEN -"amountCents" ELSE 0::bigint END), 0)::text AS "outflowCents",
            COALESCE(SUM("amountCents"), 0)::text AS "netCents"
          FROM "EconomyLedgerEntry"
          WHERE "roundPlayerId" = ${input.roundPlayerId}
            AND "createdAt" >= ${period.from}
            AND "createdAt" < ${period.to}
          GROUP BY "source", DATE_TRUNC('day', "createdAt"),
            CASE WHEN jsonb_typeof("metadata") = 'object' THEN NULLIF("metadata" ->> 'citySlug', '') ELSE NULL END
          ORDER BY "day" ASC, "source" ASC, "citySlug" ASC NULLS LAST
        `,
        tx.economyLedgerEntry.aggregate({
          where, _sum: { amountCents: true }, _count: { _all: true },
        }),
        tx.run.findMany({ where: { roundPlayerId: input.roundPlayerId, status: 'RETURNED', returnedAt: { gte: period.from, lt: period.to } }, select: { stops: { select: { order: true, city: true, route: true } }, trades: { select: { city: true, productKey: true, direction: true, totalCents: true } } } }),
        tx.business.findMany({ where: { roundId: input.roundId, turf: { holderId: input.roundPlayerId } }, select: { registerCents: true, turf: { select: { city: { select: { slug: true, name: true } } } } } }),
        tx.citySighting.findMany({ where: { roundPlayerId: input.roundPlayerId }, select: { city: true, seenAt: true, counter: true } }),
        tx.run.findMany({ where: { roundPlayerId: input.roundPlayerId, status: 'ACTIVE' }, select: { cashCents: true } }),
        tx.bossTrip.findMany({ where: { roundPlayerId: input.roundPlayerId, status: 'ACTIVE' }, select: { bankrollCents: true } }),
        tx.roundPlayer.findUniqueOrThrow({ where: { id: input.roundPlayerId }, select: { cashCents: true } }),
        tx.profitIntelligenceGoal.findUnique({ where: { roundPlayerId: input.roundPlayerId } }),
        tx.supplyStock.findMany({ where: { warehouse: { roundPlayerId: input.roundPlayerId } }, select: { productKey: true, quantity: true } }),
        tx.dealerStock.findMany({ where: { dealerCrew: { roundPlayerId: input.roundPlayerId } }, select: { productKey: true, quantity: true } }),
      ]);
      const report = projectProfitGroups({
        groups,
        ledger: { entryCount: aggregate._count._all, netCents: aggregate._sum.amountCents ?? 0n },
        ruleset: input.ruleset, roundId: input.roundId, generatedAt: now, period,
      });
      report.comparison = projectProfitComparison({
        runs, businesses, sightings, activeRuns, activeBossTrips,
        cityNames: Object.fromEntries(Object.entries(input.ruleset.cities ?? {}).map(([slug, city]) => [slug, city.name ?? slug])),
      });
      const settings = {
        minimumLiquidityCents: goalRow?.minimumLiquidityCents?.toString() ?? null,
        minimumProductKey: goalRow?.minimumProductKey ?? null,
        minimumProductUnits: goalRow?.minimumProductUnits ?? null,
        maximumRoutePurchaseCents: goalRow?.maximumRoutePurchaseCents?.toString() ?? null,
      };
      const productUnits = settings.minimumProductKey === null ? null : [
        ...warehouseStock.filter((row) => row.productKey === settings.minimumProductKey),
        ...dealerStock.filter((row) => row.productKey === settings.minimumProductKey),
      ].reduce((sum, row) => sum + row.quantity, 0);
      const registerCash = businesses.reduce((sum, business) => sum + business.registerCents, 0n);
      const awayCash = activeRuns.reduce((sum, run) => sum + run.cashCents, 0n)
        + activeBossTrips.reduce((sum, trip) => sum + trip.bankrollCents, 0n);
      report.goals = projectProfitGoals({
        settings, liquidityCents: playerCash.cashCents + registerCash + awayCash,
        productUnits, routePurchases: report.comparison.routes,
      });
      report.goals.availableProductKeys = productKeys(input.ruleset);
      return report;
    }, { isolationLevel: 'RepeatableRead' });
  },

  async saveGoals(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, input: UpdateProfitIntelligenceGoalsInput) {
    if (input.minimumProductKey !== null && !productKeys(ruleset).includes(input.minimumProductKey)) {
      throw AppError.badRequest('UNKNOWN_PRODUCT', 'That product is not part of this round.');
    }
    const saved = await prisma.profitIntelligenceGoal.upsert({
      where: { roundPlayerId },
      create: {
        roundPlayerId,
        minimumLiquidityCents: input.minimumLiquidityCents === null ? null : BigInt(input.minimumLiquidityCents),
        minimumProductKey: input.minimumProductKey,
        minimumProductUnits: input.minimumProductUnits,
        maximumRoutePurchaseCents: input.maximumRoutePurchaseCents === null ? null : BigInt(input.maximumRoutePurchaseCents),
      },
      update: {
        minimumLiquidityCents: input.minimumLiquidityCents === null ? null : BigInt(input.minimumLiquidityCents),
        minimumProductKey: input.minimumProductKey,
        minimumProductUnits: input.minimumProductUnits,
        maximumRoutePurchaseCents: input.maximumRoutePurchaseCents === null ? null : BigInt(input.maximumRoutePurchaseCents),
      },
    });
    return {
      minimumLiquidityCents: saved.minimumLiquidityCents?.toString() ?? null,
      minimumProductKey: saved.minimumProductKey,
      minimumProductUnits: saved.minimumProductUnits,
      maximumRoutePurchaseCents: saved.maximumRoutePurchaseCents?.toString() ?? null,
    };
  },
};
