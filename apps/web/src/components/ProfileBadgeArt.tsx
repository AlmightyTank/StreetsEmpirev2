import type { CSSProperties } from 'react';

type BadgeArtPosition = readonly [atlas: number, cell: number];

/**
 * Each stable award key points at its own original, illustrated crest in a
 * transparent 4×3 sprite atlas. Keys stay explicit so adding an award cannot
 * silently reuse a category icon.
 */
const badgeArtByKey: Record<string, BadgeArtPosition> = {
  // Rank, wealth, and career honors — atlas 1.
  'national-number-one': [0, 0],
  'city-boss': [0, 1],
  climber: [0, 2],
  'first-stack': [0, 3],
  'six-figures': [0, 4],
  'quarter-million': [0, 5],
  millionaire: [0, 6],
  'empire-builder': [0, 7],
  'beta-tester': [0, 9],
  veteran: [0, 10],
  'top-finisher': [0, 11],
  'hall-of-fame': [8, 8],
  'player-level-5-title': [11, 0],
  'player-level-10-title': [11, 1],
  'player-level-20-title': [11, 2],
  'player-level-30-title': [11, 3],
  'player-level-50-title': [11, 4],

  // Combat progression — atlas 2.
  'knock-knock': [1, 0],
  'first-blood': [1, 1],
  enforcer: [1, 2],
  warpath: [1, 3],
  'made-enemies': [1, 4],
  'held-the-line': [1, 5],
  untouchable: [1, 6],
  'rolling-deep': [1, 7],
  'clean-pass': [1, 8],
  'bad-batch': [1, 9],
  'burned-stable': [1, 10],
  boosted: [1, 11],

  // Intelligence, reputation, and specialist honors — atlas 3.
  'chop-shop-regular': [10, 0],
  'silver-tongue': [2, 0],
  recruiter: [2, 1],
  'stick-up-king': [2, 2],
  'most-wanted': [2, 3],
  'street-intel': [2, 4],
  'wire-tapper': [2, 5],
  'eyes-everywhere': [2, 6],
  'favor-done': [2, 7],
  connected: [2, 8],
  'shotgun-trust': [2, 9],
  'tek-runner': [2, 10],
  'heavy-metal': [2, 11],

  // Turf and block-war feats — atlas 4.
  'block-boss': [3, 0],
  'turf-veteran': [3, 1],
  'war-drums': [3, 2],
  'hostile-takeover': [3, 3],
  'smash-and-grab': [3, 4],
  'fire-sale': [3, 5],
  'siege-boss': [3, 6],
  'home-turf': [3, 7],
  'scorched-earth': [3, 8],
  'corporate-raider': [3, 9],
  'underworld-conglomerate': [3, 10],
  'war-machine': [3, 11],

  // Business, street work, and cashflow — atlas 5.
  'open-for-business': [4, 0],
  'first-payday': [4, 1],
  'side-hustle': [4, 2],
  'local-chain': [4, 3],
  'cash-flow': [4, 4],
  'clean-money': [4, 5],
  'business-district': [4, 6],
  'money-machine': [4, 7],
  'street-pharmacist': [4, 8],
  'high-roller': [4, 9],
  'street-grinder': [4, 10],

  // Travel, casino, and law feats — atlas 6.
  'first-chip': [5, 0],
  'casino-circuit': [5, 1],
  'velvet-regular': [5, 2],
  'house-guest': [5, 3],
  'big-night': [5, 4],
  'road-warrior': [5, 5],
  'grand-tour': [5, 6],
  'jackpot-hitter': [5, 7],
  whale: [5, 8],
  'clean-record': [5, 9],
  'nothing-on-paper': [5, 10],
  'off-the-books': [5, 11],

  // Hideout achievements and permanent quest badges — atlas 7.
  'first-hideout-upgrade': [6, 0],
  'hideout-regular': [6, 1],
  'room-maxed': [6, 2],
  'fully-built-hideout': [6, 3],
  'ghost-of-the-block': [7, 4],
  'top-shelf-operator': [6, 5],
  'full-rack-enforcer': [6, 6],
  'road-king': [7, 5],
  'no-paper-trail': [6, 8],
  'corner-boss': [6, 9],
  kingpin: [6, 10],
  'past-winner': [6, 11],

  // Street Pass and faction honors — atlas 8.
  'street-pass-s1-badge': [7, 0],
  'street-pass-s1-fresh-face': [7, 1],
  'street-pass-s1-made-man': [7, 2],
  'street-pass-s1-kingpin': [7, 3],
  'faction-many-friends': [7, 6],
  'faction-inner-circle': [7, 7],
  'faction-two-crowns': [7, 8],
  'kings-friend': [7, 9],
  'outfit-associate': [7, 10],
  'top-ten': [0, 8],
  'faction-kings': [7, 9],
  'faction-outfit': [7, 10],

  // Permanent quest titles from casino, law, and faction story arcs — atlases 9–10.
  'ace-floor-walker': [8, 0],
  'ace-natural': [8, 1],
  'ace-road-gambler': [8, 2],
  'ace-velvet-rope': [8, 3],
  'ace-black-room': [8, 4],
  'ledger-cool-head': [9, 0],
  'ledger-lawyered-up': [9, 1],
  'ledger-clean-hands': [9, 2],
  'ledger-teflon': [9, 3],
  'ledger-case-closed': [9, 4],
  'saints-prospect': [9, 5],
  'cartel-partner': [9, 6],
  'civic-contributor': [9, 7],
  'kings-crown-of-the-block': [11, 5],
  'outfit-seat-at-the-table': [11, 6],
  'road-saints-full-patch': [11, 7],
  'cartel-line-the-pipeline': [11, 8],
  'civic-handshake-untouchable': [11, 9],
  'faction-road-saints': [9, 5],
  'faction-cartel-line': [9, 6],
  'faction-civic-handshake': [9, 7],
};

const atlasUrls = Array.from({ length: 12 }, (_, index) =>
  `/assets/profile-badges/atlas-${String(index + 1).padStart(2, '0')}.webp`,
);

const fallbackKeyByCategory: Record<string, string> = {
  rank: 'national-number-one',
  wealth: 'first-stack',
  street: 'street-grinder',
  combat: 'knock-knock',
  intel: 'street-intel',
  turf: 'block-boss',
  travel: 'road-warrior',
  economy: 'open-for-business',
  reputation: 'connected',
  hideout: 'first-hideout-upgrade',
  casino: 'first-chip',
  legacy: 'hall-of-fame',
  quest: 'ghost-of-the-block',
  law: 'clean-record',
  community: 'beta-tester',
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
  if (['open-for-business', 'first-payday', 'side-hustle', 'local-chain', 'cash-flow', 'clean-money', 'business-district', 'money-machine', 'street-pharmacist', 'high-roller'].includes(key)) return 'economy';
  if (['block-boss', 'turf-veteran', 'war-drums', 'hostile-takeover', 'smash-and-grab', 'fire-sale', 'siege-boss', 'home-turf', 'scorched-earth', 'corporate-raider', 'war-machine'].includes(key)) return 'turf';
  if (['knock-knock', 'first-blood', 'enforcer', 'warpath', 'made-enemies', 'held-the-line', 'untouchable', 'rolling-deep', 'clean-pass', 'bad-batch', 'burned-stable', 'boosted', 'chop-shop-regular', 'silver-tongue', 'recruiter', 'stick-up-king', 'most-wanted'].includes(key)) return 'combat';
  return 'legacy';
}

/** Original StreetsEmpire artwork: a distinct dimensional crest for each known award key. */
export function ProfileBadgeArt({ badgeKey, category, rarity = 'common', size = 52, locked = false }: {
  badgeKey: string;
  category?: string;
  rarity?: string;
  size?: number;
  locked?: boolean;
}) {
  const family = category ?? badgeCategoryForKey(badgeKey);
  const art = badgeArtByKey[badgeKey] ?? badgeArtByKey[fallbackKeyByCategory[family] ?? 'hall-of-fame']!;
  const [atlas, cell] = art;
  const column = cell % 4;
  const row = Math.floor(cell / 4);
  const style = {
    width: size,
    height: size,
    backgroundImage: `url("${atlasUrls[atlas]}")`,
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
