import type { PrismaClient } from '@prisma/client';
import type { EmpireInsightsDto, EmpireInsightsRoundDto, InsightMetricDto } from '@streets/shared';
import { ActiveSupporterService } from './active-supporter.service.js';
import { emptySeasonTotals, SeasonStatsService, type SeasonStatsPlayer, type SeasonTotals } from './season-stats.service.js';
import { AppError } from '../utils/errors.js';

const metric = (value: number | null): InsightMetricDto => ({
  value,
  status: value === null ? 'NOT_RECORDED' : 'AVAILABLE',
});

function metrics(t: SeasonTotals, recorded: boolean): EmpireInsightsRoundDto['metrics'] {
  const m = (value: number) => metric(recorded ? value : null);
  return {
    street: { turnsWorked: m(t.turnsWorked), streetEarningsCents: m(t.streetEarningsCents), recruitsFound: m(t.recruitsFound), peakCrew: m(t.peakCrew) },
    combat: { raidsWon: m(t.raidsWon), raidsLost: m(t.raidsLost), defensesHeld: m(t.defensesHeld), defensesLost: m(t.defensesLost), driveBysLanded: m(t.driveBysLanded), thugsDefeated: m(t.thugsDefeated), cashStolenCents: m(t.cashStolenCents), biggestRaidCents: m(t.biggestRaidCents) },
    turf: { blocksCaptured: m(t.blocksCaptured), blocksLost: m(t.blocksLost), blockHours: m(Math.round(t.blockSeconds / 360) / 10), citiesControlled: m(t.citiesControlled) },
    travel: { runsCompleted: m(t.runsCompleted), driveHours: m(Math.round(t.driveHours * 10) / 10), cargoMoved: m(t.cargoMoved), convoyAttacksWon: m(t.convoyAttacksWon) },
    economy: { productProduced: m(t.productProduced), productSold: m(t.productSold), largestTransactionCents: m(t.largestTransactionCents), traderReputation: m(t.traderReputation) },
    business: { businessBuilds: m(t.businessBuilds), businessIncomeCents: m(t.businessIncomeCents), racketsStarted: m(t.racketsStarted), launderedHeat: m(t.launderedHeat), businessesTorched: m(t.businessesTorched), blockWarsDeclared: m(t.blockWarsDeclared), blockWarAttackWins: m(t.blockWarAttackWins), blockWarDefenseWins: m(t.blockWarDefenseWins), blockWarTakes: m(t.blockWarTakes), blockWarSacks: m(t.blockWarSacks) },
    casino: { casinoRatedWagers: m(t.casinoRatedWagers), casinoTheoCents: m(t.casinoTheoCents), casinoCitiesPlayed: m(t.casinoCitiesPlayed), casinoVipWagers: m(t.casinoVipWagers), casinoCompsCents: m(t.casinoCompsCents), casinoJackpots: m(t.casinoJackpots), casinoBiggestWinCents: m(t.casinoBiggestWinCents) },
    law: { lawSeason: m(t.lawSeason), lawPeakStage: m(t.lawPeakStage), lawWarrantsServed: m(t.lawWarrantsServed) },
    factions: { factionsConnected: m(t.factionsConnected), factionsInnerCircle: m(t.factionsInnerCircle) },
  };
}

export const EmpireInsightsService = {
  async get(prisma: PrismaClient, accountId: string, now = new Date()): Promise<EmpireInsightsDto> {
    if (!(await ActiveSupporterService.has(prisma, accountId, now, true))) {
      throw AppError.forbidden('My Empire Insights is available to active paid supporters.');
    }
    const players = await prisma.roundPlayer.findMany({
      where: { accountId },
      select: { id: true, whores: true, thugs: true, peakCrew: true, round: { select: { id: true, name: true, status: true, startsAt: true, endsAt: true, rulesetId: true, rulesetVersion: true, aftermathReport: { select: { status: true } } } } },
      orderBy: { round: { startsAt: 'desc' } },
    });
    const statsPlayers: SeasonStatsPlayer[] = players.map((p) => ({ id: p.id, whores: p.whores, thugs: p.thugs, peakCrew: p.peakCrew, round: { endsAt: p.round.endsAt, rulesetId: p.round.rulesetId, rulesetVersion: p.round.rulesetVersion } }));
    const totals = await SeasonStatsService.totals(prisma, statsPlayers, now);
    return { supporter: true, generatedAt: now.toISOString(), rounds: players.map((p) => ({ id: p.round.id, name: p.round.name, status: p.round.status, startsAt: p.round.startsAt.toISOString(), endsAt: p.round.endsAt.toISOString(), metrics: metrics(totals.get(p.id) ?? emptySeasonTotals(), totals.has(p.id) && p.round.aftermathReport?.status !== 'UNAVAILABLE') })) };
  },
};
