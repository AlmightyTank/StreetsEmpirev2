import type { PrismaClient } from '@prisma/client';
import type { AdvisorEvaluationInput } from '@streets/shared';

export const AdvisorEvaluationService = {
  async record(prisma: PrismaClient, accountId: string, roundId: string, input: AdvisorEvaluationInput): Promise<void> {
    if (input.event === 'completed') {
      const clicked = await prisma.advisorEvaluationEvent.findFirst({
        where: { accountId, roundId, suggestionKey: input.suggestionKey, event: 'clicked' },
        select: { id: true },
      });
      if (!clicked) return;
    }
    if (input.event === 'shown') {
      const existing = await prisma.advisorEvaluationEvent.findFirst({
        where: { accountId, roundId, suggestionKey: input.suggestionKey, event: 'shown', ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}) },
        select: { id: true },
      });
      if (existing) return;
    }
    await prisma.advisorEvaluationEvent.create({
      data: {
        accountId,
        roundId,
        event: input.event,
        ruleId: input.ruleId,
        suggestionKey: input.suggestionKey,
        slot: input.slot,
        focus: input.focus,
        rulesetVersion: input.rulesetVersion,
        sourceFingerprint: input.sourceFingerprint ?? null,
        outcome: input.outcome ?? null,
      },
    });
  },
};
