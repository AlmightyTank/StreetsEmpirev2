import type { PrismaClient } from '@prisma/client';
import { SUPPORTER_SOURCE } from '@streets/rulesets';
import type { PublicSupportersDto } from '@streets/shared';

/** A generous ceiling so the page stays one quick request. */
const LIST_MAX = 1000;

/**
 * The public supporter thank-you list. Only supporters who turned it on in
 * Account → Supporting appear, and only their name and the month they started:
 * nothing about amounts, payments or whether they still support. Closed and
 * banned accounts drop off; a deleted account's profile, and so its choice, is erased.
 */
export const PublicSupportersService = {
  async list(prisma: PrismaClient): Promise<PublicSupportersDto> {
    const profiles = await prisma.accountProfile.findMany({
      where: { showOnSupporterList: true, account: { isActive: true, bannedAt: null } },
      select: { accountId: true, account: { select: { username: true } } },
      take: LIST_MAX,
    });
    if (!profiles.length) return { supporters: [] };
    const firsts = await prisma.accountCosmeticUnlock.groupBy({
      by: ['accountId'],
      where: { accountId: { in: profiles.map((profile) => profile.accountId) }, sourceQuestKey: SUPPORTER_SOURCE },
      _min: { awardedAt: true },
    });
    const since = new Map(firsts.map((row) => [row.accountId, row._min.awardedAt]));
    return {
      supporters: profiles
        .flatMap((profile) => {
          const first = since.get(profile.accountId);
          return first ? [{ name: profile.account.username, since: first.toISOString().slice(0, 7) }] : [];
        })
        // Longest-standing supporters first.
        .sort((a, b) => a.since.localeCompare(b.since) || a.name.localeCompare(b.name)),
    };
  },
};
