import type { PrismaClient } from '@prisma/client';
import { SUPPORTER_COSMETICS, SUPPORTER_SOURCE } from '@streets/rulesets';
import type { SupporterBenefitsDto } from '@streets/shared';
import { env } from '../config/env.js';
import { ActiveSupporterService } from './active-supporter.service.js';
import { SupporterBillingService } from './supporter-billing.service.js';
import { SupporterService } from './supporter.service.js';

export const SupporterBenefitsService = {
  async get(prisma: PrismaClient, accountId: string, now = new Date()): Promise<SupporterBenefitsDto> {
    const [activePaid, since, status, unlocks, profile, forumLink] = await Promise.all([
      ActiveSupporterService.has(prisma, accountId, now, true),
      SupporterService.since(prisma, accountId),
      SupporterBillingService.status(prisma, accountId, now),
      prisma.accountCosmeticUnlock.findMany({ where: { accountId, sourceQuestKey: SUPPORTER_SOURCE }, select: { key: true } }),
      prisma.accountProfile.findUnique({ where: { accountId }, select: { forumCosmeticsVisible: true } }),
      prisma.forumLink.findUnique({ where: { accountId }, select: { accountId: true } }),
    ]);
    const permanent = since !== null;
    const owned = new Set(unlocks.map((row) => row.key));
    const cosmetics = Object.values(SUPPORTER_COSMETICS).map((cosmetic) => ({
      key: cosmetic.key, name: cosmetic.name, kind: cosmetic.kind, owned: owned.has(cosmetic.key),
      state: owned.has(cosmetic.key) ? 'EARNED_PERMANENTLY' as const : activePaid ? 'AVAILABLE_NOW' as const : 'NOT_AVAILABLE' as const,
    }));
    const queueEligible = activePaid && env.admission.enabled && env.admission.supporterPriority;
    return {
      activePaid, earnedPermanently: permanent,
      queue: { eligible: queueEligible, state: queueEligible ? 'ACTIVE_PAID' : env.admission.enabled ? 'COMING_LATER' : 'NOT_AVAILABLE', capacityGateEnabled: env.admission.enabled, priorityEnabled: env.admission.supporterPriority },
      monthlyDrop: status.drop ? { name: status.drop.name, held: status.drop.held, state: status.drop.held ? 'EARNED_PERMANENTLY' : activePaid ? 'AVAILABLE_NOW' : 'NOT_AVAILABLE' } : null,
      cosmetics,
      forum: { linked: forumLink !== null, visible: Boolean(profile?.forumCosmeticsVisible), syncMode: 'pull-through', state: forumLink && profile?.forumCosmeticsVisible ? 'ACTIVE_PAID' : 'NOT_AVAILABLE' },
    };
  },

  async diagnostics(prisma: PrismaClient, now = new Date()) {
    const [linkedForumAccounts, optedInForumAccounts, activeIds, permanentRows, ownedRows] = await Promise.all([
      prisma.forumLink.count(),
      prisma.accountProfile.count({ where: { forumCosmeticsVisible: true } }),
      ActiveSupporterService.accountIds(prisma, undefined, now, true),
      prisma.accountCosmeticUnlock.findMany({ where: { sourceQuestKey: SUPPORTER_SOURCE }, select: { accountId: true }, distinct: ['accountId'] }),
      prisma.accountCosmeticUnlock.count({ where: { sourceQuestKey: SUPPORTER_SOURCE } }),
    ]);
    return {
      linkedForumAccounts,
      optedInForumAccounts,
      activePaidAccounts: activeIds.size,
      permanentlyRewardedAccounts: permanentRows.length,
      permanentlyOwnedCosmetics: ownedRows,
      queue: { capacityGateEnabled: env.admission.enabled, priorityEnabled: env.admission.supporterPriority },
      forum: { mode: 'pull-through' as const, writesToFlarum: false as const },
    };
  },
};
