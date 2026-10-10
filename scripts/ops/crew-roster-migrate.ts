import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { CrewRosterService } from '../../apps/server/src/services/crew-roster.service.js';

/**
 * 1.7.0-A. Build (or re-sync) the crew roster of every player in a round, then check that
 * each player's members match their counts. Players are otherwise migrated on their first
 * action; this does the rest ahead of time. Safe to stop and run again: a player already
 * migrated is only brought back in step, and nobody is ever added twice.
 *
 *   npm run ops:crew-roster -- --round <slug>      (default: the active round)
 *   npm run ops:crew-roster -- --round <slug> --check   (verify only, write nothing)
 */

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const slug = arg('round');
  const checkOnly = process.argv.includes('--check');
  const round = slug
    ? await prisma.round.findUnique({ where: { slug } })
    : await prisma.round.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startsAt: 'desc' } });
  if (!round) throw new Error(slug ? `No round ${slug}.` : 'No active round.');
  const ruleset = loadRulesetForRound(round);
  if (!ruleset.crewRoster?.enabled) {
    console.log(`${round.name} runs ${round.rulesetId}, which has no crew roster. Nothing to do.`);
    return;
  }

  if (!checkOnly) {
    const summary = await CrewRosterService.syncRound(prisma, round.id, ruleset);
    console.log(`${round.name}: ${summary.players} players synced, ${summary.migrated} migrated, ${summary.created} members created, ${summary.released} released.`);
  }

  const [players, members, migrations] = await Promise.all([
    prisma.roundPlayer.findMany({ where: { roundId: round.id }, select: { id: true, displayName: true, thugs: true, whores: true } }),
    prisma.crewMember.groupBy({ by: ['roundPlayerId', 'role'], where: { roundPlayer: { roundId: round.id }, status: { not: 'RELEASED' } }, _count: { _all: true } }),
    prisma.crewRosterMigration.count({ where: { roundPlayer: { roundId: round.id } } }),
  ]);
  const count = (id: string, role: 'THUG' | 'WORKER') => members.find((row) => row.roundPlayerId === id && row.role === role)?._count._all ?? 0;
  const drift = players.filter((player) => count(player.id, 'THUG') !== player.thugs || count(player.id, 'WORKER') !== player.whores);
  console.log(`${migrations}/${players.length} players migrated; ${drift.length} out of step with their counts.`);
  for (const player of drift.slice(0, 20)) {
    console.log(`  ${player.displayName}: thugs ${player.thugs} vs ${count(player.id, 'THUG')} members, whores ${player.whores} vs ${count(player.id, 'WORKER')} members`);
  }
  if (drift.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
