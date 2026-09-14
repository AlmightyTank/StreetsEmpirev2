import type { ProfileBadgeDto, PublicAchievementRarity, PublicAwardDto } from '@streets/shared';

export const PROFILE_BADGE_LIMIT = 6;

const rarityOrder: Record<PublicAchievementRarity, number> = {
  legendary: 5,
  epic: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
};

/**
 * The badges a profile shows: earned legacy achievements first (they survive
 * round resets), then this round's earned achievements, rarest first.
 */
export function selectProfileBadges(
  awards: PublicAwardDto[],
  limit = PROFILE_BADGE_LIMIT,
  featuredKeys: string[] = [],
): ProfileBadgeDto[] {
  const byRarity = (a: PublicAwardDto, b: PublicAwardDto) => rarityOrder[b.rarity] - rarityOrder[a.rarity];
  const earned = awards.filter((award) => award.unlocked);
  const featured = featuredKeys
    .map((key) => earned.find((award) => award.key === key))
    .filter((award): award is PublicAwardDto => Boolean(award));
  const featuredSet = new Set(featured.map((award) => award.key));
  const permanent = earned.filter((award) => award.category === 'legacy' && !featuredSet.has(award.key)).sort(byRarity);
  const thisRound = earned.filter((award) => award.category !== 'legacy' && !featuredSet.has(award.key)).sort(byRarity);

  return [...featured, ...permanent, ...thisRound].slice(0, limit).map((award) => ({
    key: award.key,
    title: award.title,
    description: award.description,
    category: award.category,
    rarity: award.rarity,
    permanent: award.category === 'legacy',
  }));
}
