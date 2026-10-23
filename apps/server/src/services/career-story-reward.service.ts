import type { Prisma, PrismaClient } from '@prisma/client';
import type { CareerStoryBranchDefinition } from '@streets/shared';
import type { Ruleset } from '@streets/rulesets';

/** Uses the existing permanent cosmetic ledger; story recognition never enters the economy. */
export async function grantCareerStoryRecognition(
  db: Prisma.TransactionClient | PrismaClient,
  input: { accountId: string; career: string; chapterKey: string; branch: CareerStoryBranchDefinition; ruleset: Ruleset; sourceId: string },
): Promise<void> {
  if (!['TITLE', 'BADGE', 'PROFILE_MOMENT'].includes(input.branch.reward.kind)) return;
  await db.accountCosmeticUnlock.upsert({
    where: { accountId_key: { accountId: input.accountId, key: `career-story:${input.career}:${input.branch.reward.key}` } },
    create: {
      accountId: input.accountId,
      key: `career-story:${input.career}:${input.branch.reward.key}`,
      kind: input.branch.reward.kind,
      title: input.branch.reward.label,
      description: `${input.career} story recognition from ${input.chapterKey}.`,
      rarity: 'STORY',
      sourceQuestKey: `CAREER_STORY:${input.chapterKey}:${input.branch.key}:${input.sourceId}`,
      sourceRulesetId: input.ruleset.meta.id,
      sourceRulesetVersion: input.ruleset.meta.version,
    },
    update: {},
  });
}
