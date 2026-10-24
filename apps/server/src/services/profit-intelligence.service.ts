import type { PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type {
  ProfitClassification,
  ProfitIntelligenceCityTotalDto,
  ProfitIntelligenceDaySourceCityDto,
  ProfitIntelligenceDto,
  ProfitIntelligenceSourceTotalDto,
  ProfitIntelligenceTotalsDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';

export const PROFIT_CLASSIFICATION_VERSION = '2.6.0-B1' as const;
export const MAX_PROFIT_REPORT_DAYS = 90;
const DAY_MS = 86_400_000;

const SOURCE_CLASSIFICATION: Readonly<Record<string, ProfitClassification>> = {
  BUSINESS_INCOME: 'OPERATING_INCOME', TURF_TAX: 'OPERATING_INCOME', DEALER_SALES: 'OPERATING_INCOME',
  DEALER_WAGES: 'OPERATING_COST', SUPPLY_LANE_FEE: 'OPERATING_COST', SUPPLY_UPKEEP: 'OPERATING_COST',
  RUN_INCIDENT: 'FINES_AND_FEES', RUN_HOTEL: 'OPERATING_COST', TRIP_AIRPORT: 'FINES_AND_FEES',
  WARRANT: 'FINES_AND_FEES', LAWYER: 'OPERATING_COST', HEAT_BRIBE: 'FINES_AND_FEES',
  SUPPLY_ORDER: 'INVENTORY_PURCHASE', STORE_BUY: 'INVENTORY_PURCHASE', STORE_SELL: 'INVENTORY_PROCEEDS',
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
      attribution: citySlug ? 'KNOWN_CITY' : 'UNKNOWN_CITY', ...totalsDto(total),
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
  const byCity: ProfitIntelligenceCityTotalDto[] = [...byCityMap.entries()]
    .map(([citySlug, value]) => ({
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
      const [groups, aggregate] = await Promise.all([
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
      ]);
      return projectProfitGroups({
        groups,
        ledger: { entryCount: aggregate._count._all, netCents: aggregate._sum.amountCents ?? 0n },
        ruleset: input.ruleset, roundId: input.roundId, generatedAt: now, period,
      });
    }, { isolationLevel: 'RepeatableRead' });
  },
};
