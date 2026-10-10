import type { CSSProperties, ReactNode } from 'react';

type BadgePalette = { field: string; accent: string; edge: string };

const palettes: Record<string, BadgePalette> = {
  rank: { field: '#26321c', accent: '#f4cf45', edge: '#a9d46a' },
  wealth: { field: '#183a2b', accent: '#8fe275', edge: '#d0e9a2' },
  street: { field: '#143844', accent: '#5ed5ee', edge: '#b8eff4' },
  combat: { field: '#401f29', accent: '#ff6670', edge: '#f3bbc0' },
  intel: { field: '#272345', accent: '#b89cff', edge: '#dfd6ff' },
  turf: { field: '#29371f', accent: '#a5e850', edge: '#d9f1ac' },
  travel: { field: '#16314c', accent: '#67b9ff', edge: '#c8e3ff' },
  economy: { field: '#3b301b', accent: '#ffcc52', edge: '#f4e1a8' },
  reputation: { field: '#30243d', accent: '#e78ad8', edge: '#edd2ef' },
  hideout: { field: '#35301e', accent: '#eab849', edge: '#f0e3b9' },
  quest: { field: '#302546', accent: '#b9a0fa', edge: '#e2d8ff' },
  casino: { field: '#412026', accent: '#ff7775', edge: '#f3d1c7' },
  law: { field: '#243442', accent: '#a9d5e8', edge: '#e2edf1' },
  legacy: { field: '#38321d', accent: '#e8c75c', edge: '#f6e6ab' },
};

const glyphByKey: Record<string, string> = {
  'national-number-one': 'crown', 'city-boss': 'city-crown', 'top-ten': 'podium', climber: 'up-arrow',
  'first-stack': 'single-coin', 'six-figures': 'cash-stack', 'quarter-million': 'money-bag', millionaire: 'vault', 'empire-builder': 'empire',
  'street-grinder': 'sneaker',
  'knock-knock': 'door-knock', 'first-blood': 'impact', enforcer: 'fist', warpath: 'crossed-batons', 'made-enemies': 'warning', 'held-the-line': 'shield', untouchable: 'shield-star', 'rolling-deep': 'lowrider', 'clean-pass': 'speed-lines', 'bad-batch': 'crate', 'burned-stable': 'flame', boosted: 'wheel', 'chop-shop-regular': 'wrench', 'silver-tongue': 'speech', recruiter: 'crew', 'stick-up-king': 'mask', 'most-wanted': 'wanted',
  'street-intel': 'eye', 'wire-tapper': 'antenna', 'eyes-everywhere': 'binoculars',
  'favor-done': 'check-seal', connected: 'handshake', 'shotgun-trust': 'shotgun', 'tek-runner': 'tek9', 'heavy-metal': 'rifle', 'faction-many-friends': 'three-people', 'faction-inner-circle': 'inner-circle', 'faction-two-crowns': 'two-crowns',
  'first-hideout-upgrade': 'key', 'hideout-regular': 'hideout', 'room-maxed': 'room', 'fully-built-hideout': 'fortress',
  veteran: 'calendar-star', 'past-winner': 'champion-crown', 'hall-of-fame': 'hall', 'top-finisher': 'laurel-star', kingpin: 'kingpin', 'beta-tester': 'beta-star',
  'block-boss': 'block-crown', 'turf-veteran': 'block-shield', 'war-drums': 'drum', 'hostile-takeover': 'takeover', 'smash-and-grab': 'sack', 'fire-sale': 'burning-shop', 'siege-boss': 'tower', 'home-turf': 'home-shield', 'scorched-earth': 'scorched-block', 'corporate-raider': 'office-raid', 'war-machine': 'war-machine',
  'road-warrior': 'road-car', 'street-pharmacist': 'bottle-box', 'high-roller': 'deal-stack', 'open-for-business': 'open-shop', 'first-payday': 'register', 'side-hustle': 'side-stall', 'local-chain': 'shop-row', 'cash-flow': 'cash-river', 'clean-money': 'launder', 'business-district': 'district', 'money-machine': 'money-machine', 'underworld-conglomerate': 'tower-crown',
  'first-chip': 'casino-chip', 'casino-circuit': 'casino-route', 'velvet-regular': 'velvet-rope', 'house-guest': 'hotel-key', 'big-night': 'big-win', 'grand-tour': 'casino-map', 'jackpot-hitter': 'jackpot', whale: 'whale',
  'clean-record': 'clean-shield', 'nothing-on-paper': 'blank-file', 'off-the-books': 'hidden-file',
};

function glyph(key: string): string {
  return glyphByKey[key] ?? (key.startsWith('street-pass-') ? 'season-star' : 'award-star');
}

function Mark({ name, color }: { name: string; color: string }): ReactNode {
  const stroke = '#10151c';
  const common = { stroke, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'crown': case 'city-crown': case 'champion-crown': case 'kingpin': case 'block-crown': case 'tower-crown': case 'tower': case 'two-crowns':
      return <g {...common} fill={color}><path d="M8 27 5 13l8 6 7-11 7 11 8-6-3 14z"/><path d="M9 31h24v4H9z"/><path d="M12 20h16v5H12z" fill="#f6f4e8"/></g>;
    case 'city': case 'empire': case 'hall': case 'district':
      return <g {...common} fill={color}><path d="M6 33V17l7-4v20zM15 33V8l8-4v29zM25 33V15l9-5v23z"/><path d="M4 34h34v3H4z"/><path d="M10 19h2v3h-2zm9-8h2v3h-2zm0 7h2v3h-2zm10 0h2v3h-2z" fill="#fff1bb" stroke="none"/></g>;
    case 'podium': case 'up-arrow': case 'speed-lines': case 'casino-route':
      return <g {...common} fill="none"><path d="M8 31h8v-7h8v-7h9M26 10l7 7-7 7" stroke={color} strokeWidth="4"/><path d="M7 36h28" stroke="#f5edcf" strokeWidth="2"/></g>;
    case 'single-coin': case 'cash-stack': case 'money-bag': case 'deal-stack': case 'cash-river': case 'register': case 'money-machine': case 'launder':
      return <g {...common} fill={color}><path d="M8 24h23v11H8z"/><path d="m11 20 22 2-1 4-22-2zM13 16l21 3-1 4-21-3z"/><circle cx="20" cy="29" r="3.5" fill="#fff1b6"/><path d="M20 26v6m2-4c0-2-4-2-4 0s4 1 4 3-4 2-4 0" fill="none" stroke={stroke} strokeWidth="1.6"/></g>;
    case 'vault': case 'hideout': case 'fortress': case 'room': case 'key': case 'hotel-key': case 'door-knock':
      return <g {...common} fill={color}><path d="M9 7h22v28H9z"/><path d="M13 11h14v20H13z" fill="#273449"/><circle cx="24" cy="21" r="4" fill={color}/><path d="M24 24v4m0-2h5" fill="none" stroke="#fff2c4" strokeWidth="2.5"/><path d="M6 36h28" fill="none" stroke="#fff2c4"/></g>;
    case 'sneaker':
      return <g {...common} fill={color}><path d="M7 25c5 1 8-2 10-8l5 2 3 7 8 3c3 1 4 3 4 6H7z"/><path d="M8 31h27v4H8z" fill="#f8f7f0"/><path d="m18 22 5 2m-3-5 5 2" fill="none" stroke="#f8f7f0" strokeWidth="2"/></g>;
    case 'lowrider': case 'road-car': case 'wheel':
      return <g {...common} fill={color}><path d="m6 27 4-9h19l6 9 3 2v6H5v-6z"/><path d="m13 20-3 7h20l-4-7z" fill="#172538"/><circle cx="12" cy="34" r="4" fill="#f5f0da"/><circle cx="30" cy="34" r="4" fill="#f5f0da"/><path d="M6 14h7m-9-4h9" fill="none" stroke="#c9f0ff" strokeWidth="2"/></g>;
    case 'eye': case 'binoculars': case 'wanted': case 'mask':
      return <g {...common} fill="none"><path d="M5 21q15-18 30 0-15 18-30 0z" fill={color}/><circle cx="20" cy="21" r="6" fill="#1a2030"/><circle cx="20" cy="21" r="2.5" fill="#f5f1df"/><path d="M8 34h24" stroke="#fff1c3" strokeWidth="2"/></g>;
    case 'grid': case 'block-shield': case 'scorched-block':
      return <g {...common} fill={color}><path d="M8 9h10v10H8zm13 0h10v10H21zM8 22h10v10H8zm13 0h10v10H21z"/><path d="M21 22h10v10H21z" fill="#b1ee54"/><path d="M6 35h28" fill="none" stroke="#fff1c3"/></g>;
    case 'casino-chip': case 'jackpot': case 'casino-map': case 'season-star': case 'beta-star': case 'award-star': case 'impact': case 'calendar-star': case 'laurel-star': case 'star':
      return <g {...common} fill={color}><path d="m20 5 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z"/><circle cx="20" cy="22" r="5" fill="#fff1bb"/></g>;
    case 'dice': case 'whale': case 'big-win':
      return <g {...common} fill={color}><rect x="8" y="8" width="24" height="24" rx="4"/><circle cx="14" cy="14" r="2" fill="#fff" stroke="none"/><circle cx="26" cy="14" r="2" fill="#fff" stroke="none"/><circle cx="20" cy="20" r="2" fill="#fff" stroke="none"/><circle cx="14" cy="26" r="2" fill="#fff" stroke="none"/><circle cx="26" cy="26" r="2" fill="#fff" stroke="none"/></g>;
    case 'shop-row': case 'shop': case 'open-shop': case 'side-stall': case 'burning-shop':
      return <g {...common} fill={color}><path d="M8 17h24v18H8z"/><path d="m6 16 4-8h20l4 8z"/><path d="M13 20h6v8h-6zm10 0h6v4h-6z" fill="#243246"/><path d="M8 17h24" stroke="#fff4cf" strokeWidth="2"/></g>;
    case 'handshake': case 'three-people': case 'crew': case 'inner-circle':
      return <g {...common} fill={color}><circle cx="12" cy="13" r="5"/><circle cx="28" cy="13" r="5"/><path d="M4 34c0-8 3-13 8-13s8 5 8 13zm16 0c0-8 3-13 8-13s8 5 8 13z"/><path d="m15 25 5 4 5-4" fill="none" stroke="#f3e8bd" strokeWidth="3"/></g>;
    case 'bottle-box':
      return <g {...common} fill={color}><path d="M15 7h10v6l4 4v17H11V17l4-4z"/><path d="M15 19h14M20 17v12m-5-6h10" fill="none" stroke="#fff2c4" strokeWidth="2.5"/></g>;
    case 'fist': case 'crossed-batons': case 'shotgun': case 'tek9': case 'rifle': case 'war-machine': case 'drum': case 'takeover': case 'sack': case 'office-raid': case 'crate': case 'wrench':
      return <g {...common} fill={color}><path d="m7 29 22-22 5 5-22 22z"/><path d="m7 12 5-5 22 22-5 5z"/><path d="M5 34h30" stroke="#fff0c0" strokeWidth="3"/></g>;
    case 'shield': case 'shield-star': case 'home-shield': case 'clean-shield': case 'check-seal':
      return <g {...common} fill={color}><path d="M20 5 34 10v11c0 9-6 14-14 18C12 35 6 30 6 21V10z"/><path d="m13 21 5 5 10-11" fill="none" stroke="#fff5d0" strokeWidth="3"/></g>;
    case 'antenna': case 'wire':
      return <g {...common} fill="none"><path d="M20 18v18m-8 0h16" stroke={color} strokeWidth="4"/><circle cx="20" cy="13" r="4" fill={color}/><path d="M10 8a14 14 0 0 0 0 10m20-10a14 14 0 0 1 0 10M5 4a21 21 0 0 0 0 18m30-18a21 21 0 0 1 0 18" stroke={color} strokeWidth="2"/></g>;
    case 'champion': case 'trophy': case 'medal':
      return <g {...common} fill={color}><path d="M20 6 24 15 34 16l-7 7 2 10-9-5-9 5 2-10-7-7 10-1z"/><path d="M7 13c-2 7 0 14 5 19m21-19c2 7 0 14-5 19" fill="none" stroke="#fff0c0" strokeWidth="2.5"/></g>;
    case 'flame': case 'warning': case 'hidden-file':
      return <g {...common} fill={color}><path d="M22 5c2 8-6 9-3 16 2-3 5-4 7-8 6 7 9 12 6 18-2 5-7 7-13 5-7-2-10-9-7-15 2-4 5-7 10-16z"/><path d="M20 23c-4 5-4 9 1 12 4 2 8-1 7-5-1-3-4-5-5-9z" fill="#fff0bf"/></g>;
    case 'velvet-rope': case 'blank-file': case 'paper': case 'speech':
      return <g {...common} fill={color}><path d="M9 8h22v25H9z"/><path d="M13 15h14m-14 6h14m-14 6h9" fill="none" stroke="#fff0c3" strokeWidth="2.5"/></g>;
    default:
      return <g {...common} fill={color}><path d="m20 5 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z"/></g>;
  }
}

export function badgeCategoryForKey(key: string): string {
  if (key.startsWith('street-pass-') || key.startsWith('ghost-') || key.startsWith('top-shelf-') || key.startsWith('full-rack-') || key.startsWith('road-king') || key.startsWith('no-paper-') || key.startsWith('corner-boss')) return 'quest';
  if (key.startsWith('faction-')) return 'reputation';
  if (key === 'beta-tester' || ['veteran', 'past-winner', 'hall-of-fame', 'top-finisher', 'kingpin'].includes(key)) return 'legacy';
  if (['national-number-one', 'city-boss', 'top-ten', 'climber'].includes(key)) return 'rank';
  if (['first-stack', 'six-figures', 'quarter-million', 'millionaire', 'empire-builder'].includes(key)) return 'wealth';
  if (['street-grinder'].includes(key)) return 'street';
  if (['street-intel', 'wire-tapper', 'eyes-everywhere'].includes(key)) return 'intel';
  if (['first-hideout-upgrade', 'hideout-regular', 'room-maxed', 'fully-built-hideout'].includes(key)) return 'hideout';
  if (['road-warrior'].includes(key)) return 'travel';
  if (['first-chip', 'casino-circuit', 'velvet-regular', 'house-guest', 'big-night', 'grand-tour', 'jackpot-hitter', 'whale'].includes(key)) return 'casino';
  if (['clean-record', 'nothing-on-paper', 'off-the-books'].includes(key)) return 'law';
  if (['open-for-business', 'first-payday', 'side-hustle', 'local-chain', 'cash-flow', 'clean-money', 'business-district', 'money-machine', 'underworld-conglomerate', 'street-pharmacist', 'high-roller'].includes(key)) return 'economy';
  if (['block-boss', 'turf-veteran', 'war-drums', 'hostile-takeover', 'smash-and-grab', 'fire-sale', 'siege-boss', 'home-turf', 'scorched-earth', 'corporate-raider', 'war-machine'].includes(key)) return 'turf';
  if (['favor-done', 'connected', 'shotgun-trust', 'tek-runner', 'heavy-metal'].includes(key)) return 'reputation';
  if (['knock-knock', 'first-blood', 'enforcer', 'warpath', 'made-enemies', 'held-the-line', 'untouchable', 'rolling-deep', 'clean-pass', 'bad-batch', 'burned-stable', 'boosted', 'chop-shop-regular', 'silver-tongue', 'recruiter', 'stick-up-king', 'most-wanted'].includes(key)) return 'combat';
  return 'legacy';
}

export function ProfileBadgeArt({ badgeKey, category, rarity = 'common', size = 52, locked = false }: {
  badgeKey: string;
  category?: string;
  rarity?: string;
  size?: number;
  locked?: boolean;
}) {
  const family = category ?? badgeCategoryForKey(badgeKey);
  const palette = palettes[family] ?? palettes.legacy!;
  const style = { width: size, height: size, opacity: locked ? 0.35 : 1 } as CSSProperties;
  const crest = rarity === 'legendary' ? '★ ★' : rarity === 'epic' ? '★' : '';
  return (
    <svg className="se-badge-art" style={style} viewBox="0 0 40 44" role="img" aria-label={family + ' ' + rarity + ' badge'}>
      <path d="M20 1 39 20 20 43 1 20Z" fill="#080c12" stroke="#080c12" strokeWidth="2" />
      <path d="M20 3 36 20 20 39 4 20Z" fill={palette.edge} stroke="#111720" strokeWidth="1.6" />
      <path d="M20 6 33 20 20 35 7 20Z" fill={palette.field} stroke={palette.accent} strokeWidth="1.6" />
      <path d="M8 20 20 8 32 20 20 33Z" fill="none" stroke="#fff9e8" strokeOpacity=".38" strokeWidth=".7" />
      <g transform="translate(2 2) scale(.9)"><Mark name={glyph(badgeKey)} color={palette.accent} /></g>
      {crest ? <text x="20" y="8" textAnchor="middle" fill="#fff0ad" stroke="#17202b" strokeWidth=".7" fontSize="4.2" fontWeight="900">{crest}</text> : null}
    </svg>
  );
}
