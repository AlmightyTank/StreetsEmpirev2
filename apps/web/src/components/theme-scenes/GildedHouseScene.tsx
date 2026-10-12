import type { CSSProperties } from 'react';

// Roulette pockets around a wheel centred on the corner: 37 wedges between two radii.
const pocketCount = 37;
function wedge(index: number, inner: number, outer: number) {
  const point = (radius: number, step: number) => {
    const angle = (step / pocketCount) * Math.PI * 2;
    return `${(400 + Math.cos(angle) * radius).toFixed(1)} ${(400 + Math.sin(angle) * radius).toFixed(1)}`;
  };
  return `M${point(inner, index)} L${point(outer, index)} A${outer} ${outer} 0 0 1 ${point(outer, index + 1)} L${point(inner, index + 1)} A${inner} ${inner} 0 0 0 ${point(inner, index)} Z`;
}
const pockets = Array.from({ length: pocketCount }, (_, index) => ({
  d: wedge(index, 292, 338),
  fill: index === 0 ? '#15803d' : index % 2 === 0 ? '#14110f' : '#b91c1c',
}));

const suits = {
  spade: 'M0 -12 C6 -4 12 0 12 5 C12 10 6 12 2 8 L4 14 H-4 L-2 8 C-6 12 -12 10 -12 5 C-12 0 -6 -4 0 -12 Z',
  heart: 'M0 12 C-8 4 -13 0 -13 -5 C-13 -10 -6 -12 0 -6 C6 -12 13 -10 13 -5 C13 0 8 4 0 12 Z',
  diamond: 'M0 -13 L10 0 L0 13 L-10 0 Z',
  club: 'M0 -12 a5.5 5.5 0 1 1 -0.1 0 Z M-7 -1 a5.5 5.5 0 1 1 -0.1 0 Z M7 -1 a5.5 5.5 0 1 1 -0.1 0 Z M-2 2 L-4 14 H4 L2 2 Z',
} as const;
type Suit = keyof typeof suits;

// The fanned hand, back to front: [rank, suit, rotation].
const hand: readonly (readonly [string, Suit, number])[] = [
  ['10', 'spade', -30], ['J', 'club', -15], ['Q', 'diamond', 0], ['K', 'heart', 15], ['A', 'spade', 30],
];

const sparkles = [[6, 30, '-1s'], [18, 62, '-3.5s'], [92, 26, '-2s'], [80, 70, '-5s'], [50, 12, '-4.2s']] as const;

function Card({ rank, suit, rotation, front }: { rank: string; suit: Suit; rotation: number; front: boolean }) {
  const red = suit === 'heart' || suit === 'diamond';
  return (
    <g transform={`rotate(${rotation} 170 300)`}>
      <rect x="125" y="96" width="90" height="128" rx="8" fill="#f5efe0" fillOpacity=".9" stroke="#ebbf5f" strokeWidth="2" />
      <rect x="131" y="102" width="78" height="116" rx="5" fill="none" stroke="#ebbf5f" strokeOpacity=".5" />
      <g fill={red ? '#b91c1c' : '#14110f'}>
        <text x="136" y="122" className="se-gh__rank">{rank}</text>
        <path d={suits[suit]} transform="translate(141 134) scale(.5)" />
        <path d={suits[suit]} transform="translate(170 166) scale(1.4)" />
      </g>
      {front ? (
        <g clipPath="url(#se-gh-card)">
          <rect className="se-gh__card-glint" x="60" y="80" width="40" height="170" fill="url(#se-gh-glint)" transform="skewX(-18)" />
        </g>
      ) : null}
    </g>
  );
}

// Casino backdrop for the Gilded House shell (`casino-floor`): chasing marquee bulbs, a felt table
// edge with a brass rail, a fanned hand and chip stack, and a roulette wheel turning in the corner.
export default function GildedHouseScene() {
  return (
    <div className="se-theme-scene se-theme-scene--gilded-house">
      <svg className="se-gh__marquee" viewBox="0 0 1600 46">
        <rect x="-10" y="0" width="1620" height="40" fill="#1a130a" fillOpacity=".85" />
        <path d="M-10 2 H1610 M-10 38 H1610" stroke="#ebbf5f" strokeOpacity=".6" strokeWidth="2" />
        {Array.from({ length: 40 }, (_, index) => (
          <circle key={index} className={`se-gh__bulb se-gh__bulb--${index % 3}`} cx={20 + index * 40} cy="20" r="7" />
        ))}
      </svg>

      <svg className="se-gh__table" viewBox="0 0 1600 200">
        <defs>
          <linearGradient id="se-gh-felt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#14532d" />
            <stop offset="1" stopColor="#052e16" />
          </linearGradient>
        </defs>
        <path d="M-10 210 V96 Q800 20 1610 96 V210 Z" fill="url(#se-gh-felt)" />
        <path d="M120 150 Q800 80 1480 150" fill="none" stroke="#ebbf5f" strokeOpacity=".3" strokeWidth="2" strokeDasharray="2 8" />
        <path d="M-10 96 Q800 20 1610 96" fill="none" stroke="#3b1410" strokeWidth="20" />
        <path d="M-10 84 Q800 8 1610 84" fill="none" stroke="#ebbf5f" strokeOpacity=".7" strokeWidth="3" />
        <path className="se-gh__rail-glint" d="M-10 84 Q800 8 1610 84" fill="none" stroke="#fff6d8" strokeWidth="3.5" strokeDasharray="70 1800" />
      </svg>

      <svg className="se-gh__hand" viewBox="0 0 400 320">
        <defs>
          <clipPath id="se-gh-card">
            <rect x="125" y="96" width="90" height="128" rx="8" />
          </clipPath>
          <linearGradient id="se-gh-glint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff6d8" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff6d8" stopOpacity=".8" />
            <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
          </linearGradient>
        </defs>
        {hand.map(([rank, suit, rotation], index) => (
          <Card key={rank} rank={rank} suit={suit} rotation={rotation} front={index === hand.length - 1} />
        ))}
        <g>
          {Array.from({ length: 7 }, (_, index) => {
            const y = 296 - index * 8;
            return (
              <g key={index}>
                <rect x="300" y={y} width="64" height="8" fill="#7f1d1d" />
                <path d={`M306 ${y} v8 M322 ${y} v8 M342 ${y} v8 M358 ${y} v8`} stroke="#f5efe0" strokeOpacity=".7" strokeWidth="3" />
                <ellipse cx="332" cy={y} rx="32" ry="9" fill="#b91c1c" stroke="#f5efe0" strokeOpacity=".5" strokeDasharray="6 6" />
              </g>
            );
          })}
          <ellipse cx="332" cy="248" rx="18" ry="5" fill="none" stroke="#ebbf5f" strokeOpacity=".7" />
        </g>
      </svg>

      <svg className="se-gh__wheel" viewBox="0 0 400 400">
        <defs>
          <radialGradient id="se-gh-cone" cx="1" cy="1" r="1">
            <stop offset="0" stopColor="#5a3a1a" />
            <stop offset="1" stopColor="#24150a" />
          </radialGradient>
        </defs>
        <circle cx="400" cy="400" r="392" fill="#1f1209" stroke="#ebbf5f" strokeOpacity=".4" strokeWidth="3" />
        <circle cx="400" cy="400" r="346" fill="none" stroke="#ebbf5f" strokeOpacity=".65" strokeWidth="4" />
        <g className="se-gh__spin">
          {pockets.map((pocket, index) => <path key={index} d={pocket.d} fill={pocket.fill} fillOpacity=".85" stroke="#ebbf5f" strokeOpacity=".55" />)}
          <circle cx="400" cy="400" r="290" fill="url(#se-gh-cone)" />
          <path d="M400 130 V400 M130 400 H400 M209 209 L400 400" stroke="#ebbf5f" strokeOpacity=".35" strokeWidth="6" />
        </g>
        <g className="se-gh__ball">
          <circle cx="400" cy="68" r="8" fill="#f5efe0" />
        </g>
      </svg>

      <div className="se-gh__sparkles">
        {sparkles.map(([left, top, delay], index) => (
          <i key={index} style={{ left: `${left}%`, top: `${top}%`, animationDelay: delay } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
