import type { PublicAchievementCategory, PublicAchievementRarity, PublicAwardDto } from '@streets/shared';
import { SEALED_TOTALS, type SeasonTotals } from './season-stats.service.js';

/**
 * 0.9.0-F. Season feats: one big season of a particular kind of play. Each one
 * unlocks a cosmetic profile title (see profile-titles.ts) and nothing else;
 * titles never carry a mechanical bonus.
 *
 * A feat is earned inside one season but kept for good. It is re-derived from
 * each season's stat history rather than stored, so a voided battle that
 * earned one takes it back, and seasons from before 0.9.0-F count too.
 *
 * BALANCE_APPROXIMATION: targets are set for a 28-day round at ~24 turns an
 * hour and should be revisited with real 0.9.0 season data.
 */
export interface SeasonFeat {
  key: string;
  title: string;
  description: string;
  category: PublicAchievementCategory;
  rarity: PublicAchievementRarity;
  target: number;
  progressLabel: string;
  stat: keyof SeasonTotals | ((totals: SeasonTotals) => number);
  /** The total whose sealing hides this feat's progress. */
  sealedBy?: keyof SeasonTotals;
  /** Progress is money, for display. */
  cents?: boolean;
}

export const SEASON_FEATS: readonly SeasonFeat[] = [
  { key: 'street-grinder', title: 'Street Grinder', description: 'Work 5,000 turns on the street in one season.', category: 'street', rarity: 'rare', target: 5_000, progressLabel: 'turns worked', stat: 'turnsWorked' },
  { key: 'stick-up-king', title: 'Stick-Up King', description: 'Take $250,000 off rival crews in one season.', category: 'combat', rarity: 'epic', target: 250_000_00, progressLabel: 'cash stolen', stat: 'cashStolenCents', cents: true },
  { key: 'most-wanted', title: 'Most Wanted', description: 'Get raided fifteen times in one season.', category: 'combat', rarity: 'rare', target: 15, progressLabel: 'incoming raids', stat: (totals) => totals.defensesHeld + totals.defensesLost },
  { key: 'block-boss', title: 'Block Boss', description: 'Capture five blocks in one season.', category: 'turf', rarity: 'rare', target: 5, progressLabel: 'blocks captured', stat: 'blocksCaptured' },
  { key: 'turf-veteran', title: 'Turf Veteran', description: 'Hold 500 block-hours of turf in one season.', category: 'turf', rarity: 'epic', target: 500, progressLabel: 'block-hours held', stat: (totals) => Math.floor(totals.blockSeconds / 3600) },
  { key: 'road-warrior', title: 'Road Warrior', description: 'Bring ten runs home in one season.', category: 'travel', rarity: 'uncommon', target: 10, progressLabel: 'runs completed', stat: 'runsCompleted' },
  { key: 'street-pharmacist', title: 'Street Pharmacist', description: 'Sell 5,000 units of product in one season.', category: 'economy', rarity: 'rare', target: 5_000, progressLabel: 'product sold', stat: 'productSold' },
  { key: 'high-roller', title: 'High Roller', description: 'Close a single $100,000 deal.', category: 'economy', rarity: 'epic', target: 100_000_00, progressLabel: 'largest deal', stat: 'largestTransactionCents', cents: true },
];

export function featValue(feat: SeasonFeat, totals: SeasonTotals): number {
  return typeof feat.stat === 'function' ? feat.stat(totals) : totals[feat.stat];
}

function featSealed(feat: SeasonFeat): boolean {
  return typeof feat.stat === 'string' ? SEALED_TOTALS.has(feat.stat) : Boolean(feat.sealedBy && SEALED_TOTALS.has(feat.sealedBy));
}

export interface FeatSeason {
  name: string;
  totals: SeasonTotals;
}

/**
 * Awards for every feat. `current` is the live season (progress is measured
 * against it); `past` are finished seasons in any order, oldest earning wins.
 * `sealed` hides progress on feats whose stat is sealed for this viewer.
 */
export function seasonFeatAwards(
  current: FeatSeason | null,
  past: Array<FeatSeason & { endedAt: Date }>,
  sealed = false,
): PublicAwardDto[] {
  const oldestFirst = [...past].sort((a, b) => a.endedAt.getTime() - b.endedAt.getTime());
  return SEASON_FEATS.map((feat) => {
    const currentValue = current ? featValue(feat, current.totals) : 0;
    const pastSeason = oldestFirst.find((season) => featValue(feat, season.totals) >= feat.target);
    const thisSeason = current !== null && currentValue >= feat.target;
    const unlocked = thisSeason || Boolean(pastSeason);
    const hideProgress = sealed && featSealed(feat);
    return {
      key: feat.key,
      title: feat.title,
      description: feat.description,
      category: feat.category,
      rarity: feat.rarity,
      unlocked,
      earnedAt: null,
      earnedSeason: thisSeason ? current!.name : pastSeason?.name ?? null,
      progress: hideProgress
        ? null
        : {
          current: Math.max(0, currentValue),
          target: feat.target,
          label: feat.progressLabel,
          ...(feat.cents ? { unit: 'cents' as const } : {}),
        },
    };
  });
}
