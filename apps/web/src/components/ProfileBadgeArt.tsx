import type { CSSProperties } from 'react';

const atlasPositionByCategory: Record<string, [number, number]> = {
  rank: [0, 0],
  wealth: [1, 0],
  street: [2, 0],
  combat: [3, 0],
  intel: [0, 1],
  turf: [1, 1],
  travel: [2, 1],
  economy: [3, 1],
  reputation: [0, 2],
  hideout: [1, 2],
  casino: [2, 2],
  legacy: [3, 2],
  quest: [3, 2],
  law: [0, 1],
  community: [0, 2],
};

function badgeCategoryForKey(key: string): string {
  if (key.startsWith('street-pass-') || key.startsWith('ghost-') || key.startsWith('top-shelf-') || key.startsWith('full-rack-') || key.startsWith('road-king') || key.startsWith('no-paper-') || key.startsWith('corner-boss') || key.startsWith('quest-')) return 'quest';
  if (key.startsWith('faction-') || ['favor-done', 'connected', 'shotgun-trust', 'tek-runner', 'heavy-metal'].includes(key)) return 'reputation';
  if (key === 'beta-tester' || ['veteran', 'past-winner', 'hall-of-fame', 'top-finisher', 'kingpin'].includes(key)) return 'legacy';
  if (['national-number-one', 'city-boss', 'top-ten', 'climber'].includes(key)) return 'rank';
  if (['first-stack', 'six-figures', 'quarter-million', 'millionaire', 'empire-builder'].includes(key)) return 'wealth';
  if (key === 'street-grinder') return 'street';
  if (['street-intel', 'wire-tapper', 'eyes-everywhere'].includes(key)) return 'intel';
  if (['first-hideout-upgrade', 'hideout-regular', 'room-maxed', 'fully-built-hideout'].includes(key)) return 'hideout';
  if (key === 'road-warrior') return 'travel';
  if (['first-chip', 'casino-circuit', 'velvet-regular', 'house-guest', 'big-night', 'grand-tour', 'jackpot-hitter', 'whale'].includes(key)) return 'casino';
  if (['clean-record', 'nothing-on-paper', 'off-the-books'].includes(key)) return 'law';
  if (['open-for-business', 'first-payday', 'side-hustle', 'local-chain', 'cash-flow', 'clean-money', 'business-district', 'money-machine', 'underworld-conglomerate', 'street-pharmacist', 'high-roller'].includes(key)) return 'economy';
  if (['block-boss', 'turf-veteran', 'war-drums', 'hostile-takeover', 'smash-and-grab', 'fire-sale', 'siege-boss', 'home-turf', 'scorched-earth', 'corporate-raider', 'war-machine'].includes(key)) return 'turf';
  if (['knock-knock', 'first-blood', 'enforcer', 'warpath', 'made-enemies', 'held-the-line', 'untouchable', 'rolling-deep', 'clean-pass', 'bad-batch', 'burned-stable', 'boosted', 'chop-shop-regular', 'silver-tongue', 'recruiter', 'stick-up-king', 'most-wanted'].includes(key)) return 'combat';
  return 'legacy';
}

/** Original illustrated crest artwork displayed from the shared 4×3 badge atlas. */
export function ProfileBadgeArt({ badgeKey, category, rarity = 'common', size = 52, locked = false }: {
  badgeKey: string;
  category?: string;
  rarity?: string;
  size?: number;
  locked?: boolean;
}) {
  const family = category ?? badgeCategoryForKey(badgeKey);
  const [column, row] = atlasPositionByCategory[family] ?? atlasPositionByCategory.legacy!;
  const style = {
    width: size,
    height: size,
    backgroundPosition: `${(column / 3) * 100}% ${(row / 2) * 100}%`,
    opacity: locked ? 0.35 : 1,
  } as CSSProperties;

  return (
    <span
      className={`se-badge-art se-badge-art--${rarity}${locked ? ' is-locked' : ''}`}
      style={style}
      role="img"
      aria-label={`${family} ${rarity} badge`}
    />
  );
}
