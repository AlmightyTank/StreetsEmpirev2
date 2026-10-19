import type { PrismaClient } from '@prisma/client';
import type { AdvisorFocus, AdvisorPreferenceInput } from '@streets/shared';

const DEFAULT: AdvisorPreferenceInput = { focus: 'balanced', silenced: false };

function read(value: unknown): AdvisorPreferenceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT };
  const raw = value as Record<string, unknown>;
  const focus = ['balanced', 'money', 'territory', 'crew', 'quests'].includes(String(raw.focus)) ? raw.focus as AdvisorFocus : 'balanced';
  return { focus, silenced: raw.silenced === true };
}

export const AdvisorContextService = {
  async preferences(prisma: PrismaClient, accountId: string): Promise<AdvisorPreferenceInput> {
    const row = await prisma.accountProfile.findUnique({ where: { accountId }, select: { advisorPreferences: true } });
    return read(row?.advisorPreferences);
  },

  async updatePreferences(prisma: PrismaClient, accountId: string, patch: AdvisorPreferenceInput): Promise<AdvisorPreferenceInput> {
    const current = await this.preferences(prisma, accountId);
    const next = { ...current, ...patch };
    await prisma.accountProfile.upsert({
      where: { accountId },
      create: { accountId, advisorPreferences: next },
      update: { advisorPreferences: next },
    });
    return next;
  },

  async suppressions(prisma: PrismaClient, accountId: string, roundId: string, now = new Date()): Promise<Set<string>> {
    const rows = await prisma.advisorSuppression.findMany({ where: { accountId, roundId, OR: [{ until: null }, { until: { gt: now } }] }, select: { suggestionKey: true } });
    return new Set(rows.map((row) => row.suggestionKey));
  },

  async suppress(prisma: PrismaClient, accountId: string, roundId: string, suggestionKey: string, mode: 'snooze' | 'dismiss', now = new Date()): Promise<void> {
    await prisma.advisorSuppression.upsert({
      where: { accountId_roundId_suggestionKey: { accountId, roundId, suggestionKey } },
      create: { accountId, roundId, suggestionKey, mode, until: mode === 'snooze' ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null },
      update: { mode, until: mode === 'snooze' ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null },
    });
  },
};
