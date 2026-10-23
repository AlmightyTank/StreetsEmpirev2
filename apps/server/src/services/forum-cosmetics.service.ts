import type { PrismaClient } from '@prisma/client';
import type { ForumCosmeticsDto } from '@streets/shared';
import { SUPPORTER_SOURCE } from '@streets/rulesets';
import { ActiveSupporterService } from './active-supporter.service.js';

export const ForumCosmeticsService = {
  async forAccount(prisma: PrismaClient, accountId: string): Promise<ForumCosmeticsDto> {
    const [profile, active, permanent] = await Promise.all([
      prisma.accountProfile.findUnique({ where: { accountId }, select: { forumCosmeticsVisible: true, activeAvatarFrameKey: true } }),
      ActiveSupporterService.has(prisma, accountId),
      prisma.accountCosmeticUnlock.count({ where: { accountId, sourceQuestKey: SUPPORTER_SOURCE } }),
    ]);
    const hasPermanent = permanent > 0;
    let avatarFrameKey: string | null = null;
    if (profile?.activeAvatarFrameKey) {
      const owned = await prisma.accountCosmeticUnlock.findFirst({ where: { accountId, key: profile.activeAvatarFrameKey, kind: 'PROFILE_FRAME' }, select: { key: true } });
      avatarFrameKey = owned?.key ?? null;
    }
    return {
      visible: profile?.forumCosmeticsVisible ?? false,
      supporter: { active, permanent: hasPermanent, badgeKey: 'supporter-active', nameplateKey: hasPermanent ? 'supporter-forum-nameplate' : null, frameKey: hasPermanent ? 'supporter-forum-frame' : null },
      avatarFrameKey,
    };
  },
};
