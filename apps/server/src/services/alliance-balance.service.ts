import type { PrismaClient } from '@prisma/client';
import type { AllianceBalanceCellDto, AllianceBalanceDto } from '@streets/shared';
import { loadRulesetForRound } from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';

interface BattleGroup {
  kind: string;
  attacker_ally: boolean;
  defender_ally: boolean;
  intel: string | null;
  revenge: boolean;
  count: number;
  wins: number;
}

function cell(rows: BattleGroup[]): AllianceBalanceCellDto {
  const battles = rows.reduce((sum, row) => sum + row.count, 0);
  const wins = rows.reduce((sum, row) => sum + row.wins, 0);
  return { battles, attackerWins: wins, attackerWinPercent: battles ? Math.round(wins * 1000 / battles) / 10 : null };
}

function median(values: bigint[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? Number(sorted[middle]) : Number((sorted[middle - 1]! + sorted[middle]!) / 2n);
}

/**
 * 0.3.0-E. What an alliance round actually did, for the balance pass: who wins
 * raids between solo players and alliance members, how much shared intel and
 * revenge get used, and whether alliances crowd the top of the rankings.
 * Voided battles and inactive accounts are left out.
 */
export const AllianceBalanceService = {
  async report(prisma: PrismaClient, roundId: string, topCount = 10): Promise<AllianceBalanceDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);

    const [groups, players, alliances] = await Promise.all([
      prisma.$queryRaw<BattleGroup[]>`
        SELECT COALESCE(b."attackerReport"->>'kind', b.kind::text) AS kind,
               (b."attackerAllianceId" IS NOT NULL) AS attacker_ally,
               (b."defenderAllianceId" IS NOT NULL) AS defender_ally,
               b."attackerIntel" AS intel,
               COALESCE((b.calculation->>'retaliation')::boolean, false) AS revenge,
               COUNT(*)::int AS count,
               SUM(CASE WHEN (b."attackerReport"->>'won')::boolean THEN 1 ELSE 0 END)::int AS wins
        FROM "RaidBattle" b
        JOIN "RoundPlayer" p ON p.id = b."attackerId"
        WHERE p."roundId" = ${roundId} AND b."voidedAt" IS NULL
        GROUP BY 1, 2, 3, 4, 5`,
      prisma.roundPlayer.findMany({
        where: { roundId, account: { isActive: true } },
        select: { netWorthCents: true, allianceId: true },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
      }),
      prisma.alliance.findMany({ where: { roundId, disbandedAt: null }, select: { id: true, name: true, tag: true } }),
    ]);

    const solo = players.filter((player) => !player.allianceId);
    const members = players.filter((player) => player.allianceId);
    const top = players.slice(0, topCount);
    const total = players.reduce((sum, player) => sum + player.netWorthCents, 0n);
    const byAlliance = alliances.map((alliance) => {
      const rows = players.filter((player) => player.allianceId === alliance.id);
      const worth = rows.reduce((sum, player) => sum + player.netWorthCents, 0n);
      return {
        name: alliance.name, tag: alliance.tag, members: rows.length,
        inTopCount: top.filter((player) => player.allianceId === alliance.id).length,
        netWorthSharePercent: total > 0n ? Math.round(Number(worth * 1000n / total)) / 10 : 0,
      };
    }).sort((a, b) => b.netWorthSharePercent - a.netWorthSharePercent);

    const pick = (filter: (row: BattleGroup) => boolean) => cell(groups.filter(filter));
    const kinds = [...new Set(groups.map((row) => row.kind))].sort();

    return {
      roundId,
      roundName: round.name,
      rulesetId: round.rulesetId,
      alliancesEnabled: Boolean(ruleset.alliances),
      sharedIntelEnabled: Boolean(ruleset.alliances?.sharedIntel),
      players: { total: players.length, inAlliances: members.length, alliances: alliances.length },
      standings: {
        topCount,
        topInAlliances: top.filter((player) => player.allianceId).length,
        medianSoloNetWorthCents: median(solo.map((player) => player.netWorthCents)),
        medianMemberNetWorthCents: median(members.map((player) => player.netWorthCents)),
        alliances: byAlliance,
      },
      battles: {
        all: cell(groups),
        soloIntoSolo: pick((row) => !row.attacker_ally && !row.defender_ally),
        soloIntoAlliance: pick((row) => !row.attacker_ally && row.defender_ally),
        allianceIntoSolo: pick((row) => row.attacker_ally && !row.defender_ally),
        allianceIntoAlliance: pick((row) => row.attacker_ally && row.defender_ally),
        revenge: pick((row) => row.revenge),
        withOwnIntel: pick((row) => row.intel === 'own'),
        withAllyIntel: pick((row) => row.intel === 'ally'),
        withoutIntel: pick((row) => row.intel === null),
        byKind: kinds.map((kind) => ({ kind, ...pick((row) => row.kind === kind) })),
      },
    };
  },
};

export function allianceBalanceMarkdown(report: AllianceBalanceDto): string {
  const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
  const rate = (row: AllianceBalanceCellDto) => row.attackerWinPercent === null ? 'no battles' : `${row.attackerWinPercent}% of ${row.battles.toLocaleString('en-US')}`;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const { battles, standings, players } = report;
  return [
    `# Alliance balance: ${report.roundName}`, '',
    `Ruleset ${report.rulesetId}. Alliances ${report.alliancesEnabled ? 'on' : 'off'}, shared intel ${report.sharedIntelEnabled ? 'on' : 'off'}.`,
    'Voided battles and inactive accounts are excluded. Battles from before 0.3.0-E did not record the attacker\'s alliance or intel, so they count as solo attackers without intel.', '',
    '## Players', '',
    `${players.inAlliances} of ${plural(players.total, 'active player')} ${players.inAlliances === 1 ? 'is' : 'are'} in ${players.alliances === 1 ? '1 alliance' : `${players.alliances} alliances`}.`,
    `Top ${standings.topCount}: ${standings.topInAlliances} in alliances. Median net worth: solo ${money(standings.medianSoloNetWorthCents)}, members ${money(standings.medianMemberNetWorthCents)}.`, '',
    '| Alliance | Members | In top | Share of all net worth |', '| --- | ---: | ---: | ---: |',
    ...standings.alliances.map((row) => `| [${row.tag}] ${row.name} | ${row.members} | ${row.inTopCount} | ${row.netWorthSharePercent}% |`), '',
    '## Attacker win rates', '',
    '| Matchup | Attacker wins |', '| --- | ---: |',
    `| All battles | ${rate(battles.all)} |`,
    `| Solo into solo | ${rate(battles.soloIntoSolo)} |`,
    `| Solo into alliance member | ${rate(battles.soloIntoAlliance)} |`,
    `| Alliance member into solo | ${rate(battles.allianceIntoSolo)} |`,
    `| Alliance into alliance | ${rate(battles.allianceIntoAlliance)} |`,
    `| Revenge hits | ${rate(battles.revenge)} |`,
    `| With own recon | ${rate(battles.withOwnIntel)} |`,
    `| With an ally's recon | ${rate(battles.withAllyIntel)} |`,
    `| Without recon | ${rate(battles.withoutIntel)} |`,
    ...battles.byKind.map((row) => `| Form: ${row.kind} | ${rate(row)} |`), '',
  ].join('\n');
}
