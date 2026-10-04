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

  // 1.1.0 — Businesses, Fronts & Rackets.
  { key: 'open-for-business', title: 'Open for Business', description: 'Build your first business.', category: 'economy', rarity: 'common', target: 1, progressLabel: 'business builds', stat: 'businessBuilds' },
  { key: 'first-payday', title: 'First Payday', description: 'Earn your first business income.', category: 'economy', rarity: 'common', target: 1, progressLabel: 'business income', stat: 'businessIncomeCents', sealedBy: 'streetEarningsCents', cents: true },
  { key: 'side-hustle', title: 'Side Hustle', description: 'Start your first racket.', category: 'economy', rarity: 'common', target: 1, progressLabel: 'rackets started', stat: 'racketsStarted', sealedBy: 'streetEarningsCents' },
  { key: 'war-drums', title: 'War Drums', description: 'Declare your first block war.', category: 'turf', rarity: 'common', target: 1, progressLabel: 'block wars declared', stat: 'blockWarsDeclared' },

  { key: 'local-chain', title: 'Local Chain', description: 'Build or upgrade ten business levels in one season.', category: 'economy', rarity: 'uncommon', target: 10, progressLabel: 'business builds', stat: 'businessBuilds' },
  { key: 'cash-flow', title: 'Cash Flow', description: 'Earn $100,000 in business income in one season.', category: 'economy', rarity: 'uncommon', target: 100_000_00, progressLabel: 'business income', stat: 'businessIncomeCents', sealedBy: 'streetEarningsCents', cents: true },
  { key: 'hostile-takeover', title: 'Hostile Takeover', description: 'Win a Take block war.', category: 'turf', rarity: 'uncommon', target: 1, progressLabel: 'Take wars won', stat: 'blockWarTakes' },
  { key: 'smash-and-grab', title: 'Smash & Grab', description: 'Win a Sack block war.', category: 'turf', rarity: 'uncommon', target: 1, progressLabel: 'Sack wars won', stat: 'blockWarSacks' },
  { key: 'fire-sale', title: 'Fire Sale', description: 'Finish torching a business during a block war.', category: 'turf', rarity: 'uncommon', target: 1, progressLabel: 'businesses torched', stat: 'businessesTorched' },

  { key: 'clean-money', title: 'Clean Money', description: 'Launder 100 Heat through businesses in one season.', category: 'economy', rarity: 'rare', target: 100, progressLabel: 'Heat laundered', stat: 'launderedHeat', sealedBy: 'streetEarningsCents' },
  { key: 'business-district', title: 'Business District', description: 'Build or upgrade twenty-five business levels in one season.', category: 'economy', rarity: 'rare', target: 25, progressLabel: 'business builds', stat: 'businessBuilds' },
  { key: 'money-machine', title: 'Money Machine', description: 'Earn $500,000 in business income in one season.', category: 'economy', rarity: 'rare', target: 500_000_00, progressLabel: 'business income', stat: 'businessIncomeCents', sealedBy: 'streetEarningsCents', cents: true },
  { key: 'siege-boss', title: 'Siege Boss', description: 'Win five block wars as the attacker in one season.', category: 'turf', rarity: 'rare', target: 5, progressLabel: 'attacking block-war wins', stat: 'blockWarAttackWins' },
  { key: 'home-turf', title: 'Home Turf', description: 'Win five block wars as the defender in one season.', category: 'turf', rarity: 'rare', target: 5, progressLabel: 'defended block wars', stat: 'blockWarDefenseWins' },

  { key: 'scorched-earth', title: 'Scorched Earth', description: 'Finish torching five businesses in one season.', category: 'turf', rarity: 'epic', target: 5, progressLabel: 'businesses torched', stat: 'businessesTorched' },
  { key: 'corporate-raider', title: 'Corporate Raider', description: 'Win five Take block wars in one season.', category: 'turf', rarity: 'epic', target: 5, progressLabel: 'Take wars won', stat: 'blockWarTakes' },

  { key: 'underworld-conglomerate', title: 'Underworld Conglomerate', description: 'Build or upgrade forty-five business levels in one season.', category: 'economy', rarity: 'legendary', target: 45, progressLabel: 'business builds', stat: 'businessBuilds' },
  { key: 'war-machine', title: 'War Machine', description: 'Win ten block wars as attacker or defender in one season.', category: 'turf', rarity: 'legendary', target: 10, progressLabel: 'block-war wins', stat: (totals) => totals.blockWarAttackWins + totals.blockWarDefenseWins },
];

export function featValue(feat: SeasonFeat, totals: SeasonTotals): number {
  return typeof feat.stat === 'function' ? feat.stat(totals) : totals[feat.stat];
}

function featSealed(feat: SeasonFeat): boolean {
  return Boolean(feat.sealedBy && SEALED_TOTALS.has(feat.sealedBy))
    || (typeof feat.stat === 'string' && SEALED_TOTALS.has(feat.stat));
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
