import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { AllianceBalanceService, allianceBalanceMarkdown } from '../../apps/server/src/services/alliance-balance.service.js';

/** 0.3.0-E. npm run qa:alliance-balance -- [--round <slug>] [--top 10] [--output path.md]. Read-only. */
const args = process.argv.slice(2);
const option = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const prisma = new PrismaClient();
try {
  const slug = option('--round');
  const round = slug
    ? await prisma.round.findUnique({ where: { slug } })
    : await prisma.round.findFirst({ where: { status: { in: ['ACTIVE', 'ENDED', 'ARCHIVED'] } }, orderBy: { startsAt: 'desc' } });
  if (!round) throw new Error(slug ? `No round with slug ${slug}.` : 'No round found.');
  const report = allianceBalanceMarkdown(await AllianceBalanceService.report(prisma, round.id, Number(option('--top') ?? 10)));
  const output = option('--output');
  if (output) await writeFile(output, report, 'utf8');
  console.log(report);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
