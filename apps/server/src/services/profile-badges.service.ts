import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { ProfileBadgeDto } from '@streets/shared';
import { CommunityService, permanentAwardsForAccount } from './community.service.js';
import { selectProfileBadges } from './profile-badges.js';
import { RoundPlayerService } from './round-player.service.js';
import { RoundService } from './round.service.js';
import { ActiveSupporterService } from './active-supporter.service.js';

const SUPPORTER_FORUM_FLAIR: ProfileBadgeDto = {
  key: 'supporter-active',
  title: 'Supporter',
  description: 'Currently supporting StreetsEmpire.',
  category: 'quest',
  rarity: 'epic',
  permanent: false,
};

async function activeSupporterFlair(prisma: PrismaClient, accountId: string): Promise<ProfileBadgeDto[]> {
  return await ActiveSupporterService.has(prisma, accountId) ? [SUPPORTER_FORUM_FLAIR] : [];
}

export const ProfileBadgeService = {
  /**
   * Badges for a permanent account, for the forum. Players in the current round
   * get the same strip as their game profile; everyone else still keeps their
   * legacy badges between rounds.
   */
  async forAccount(prisma: PrismaClient, accountId: string): Promise<ProfileBadgeDto[]> {
    const supporterFlair = await activeSupporterFlair(prisma, accountId);
    const round = await RoundService.getCurrent(prisma);
    const player = round ? await RoundPlayerService.find(prisma, round.id, accountId) : null;
    if (round && player) {
      const profile = await CommunityService.profile(
        prisma, round.id, player.publicPimpId, 0, loadRulesetForRound(round), { forumGroups: false },
      );
      return [...supporterFlair, ...profile.badges];
    }
    return [...supporterFlair, ...selectProfileBadges(await permanentAwardsForAccount(prisma, accountId, round?.id ?? null))];
  },
};
