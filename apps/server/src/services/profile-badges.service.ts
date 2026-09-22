import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { ProfileBadgeDto } from '@streets/shared';
import { betaTesterAwardsForAccount, CommunityService, legacyAchievements, loadAccountLegacy } from './community.service.js';
import { selectProfileBadges } from './profile-badges.js';
import { RoundPlayerService } from './round-player.service.js';
import { RoundService } from './round.service.js';

export const ProfileBadgeService = {
  /**
   * Badges for a permanent account, for the forum. Players in the current round
   * get the same strip as their game profile; everyone else still keeps their
   * legacy badges between rounds.
   */
  async forAccount(prisma: PrismaClient, accountId: string): Promise<ProfileBadgeDto[]> {
    const round = await RoundService.getCurrent(prisma);
    const player = round ? await RoundPlayerService.find(prisma, round.id, accountId) : null;
    if (round && player) {
      const profile = await CommunityService.profile(
        prisma, round.id, player.publicPimpId, 0, loadRulesetForRound(round), { forumGroups: false },
      );
      return profile.badges;
    }
    const [legacy, betaTester] = await Promise.all([
      loadAccountLegacy(prisma, accountId, round?.id ?? null),
      betaTesterAwardsForAccount(prisma, accountId),
    ]);
    return selectProfileBadges([...legacyAchievements(legacy), ...betaTester]);
  },
};
