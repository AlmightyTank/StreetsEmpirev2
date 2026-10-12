import type { CSSProperties } from 'react';

// A laurel wreath: two sprigs of leaves rising from the bottom up either side of a centre,
// each leaf laid along the arc and shrinking toward the tip.
function Laurel({ cx, cy, radius, leaf }: { cx: number; cy: number; radius: number; leaf: number }) {
  const leaves = [];
  for (let step = 0; step < 7; step += 1) {
    const t = step / 6;
    for (const side of [-1, 1]) {
      const degrees = side === -1 ? 110 + t * 110 : 70 - t * 110;
      const angle = (degrees * Math.PI) / 180;
      const x = (cx + Math.cos(angle) * radius).toFixed(1);
      const y = (cy + Math.sin(angle) * radius).toFixed(1);
      const size = leaf * (1 - t * 0.35);
      leaves.push(
        <ellipse key={`${step}${side}`} cx={x} cy={y} rx={size.toFixed(1)} ry={(size * 0.42).toFixed(1)} transform={`rotate(${(degrees + 90 + side * 22).toFixed(1)} ${x} ${y})`} />,
      );
    }
  }
  return <g>{leaves}</g>;
}

function Star({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? r : r * 0.45;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  });
  return <polygon points={points.join(' ')} />;
}

// Banners hanging from the rod: [x, width, length, velvet tone, sway delay].
const banners = [[40, 92, 300, 'teal', '0s'], [162, 84, 230, 'wine', '-2.2s']] as const;

const flakes = [
  ['7%', '-2s', '17s'], ['15%', '-9s', '21s'], ['24%', '-5s', '19s'], ['33%', '-13s', '23s'], ['47%', '-7s', '18s'],
  ['58%', '-15s', '22s'], ['66%', '-3s', '20s'], ['74%', '-11s', '24s'], ['85%', '-6s', '19s'], ['93%', '-14s', '21s'],
] as const;

function BannerRod({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`se-la__banners se-la__banners--${side}`} viewBox="0 0 300 380">
      <defs>
        <linearGradient id={`se-la-velvet-teal-${side}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0b3b37" />
          <stop offset=".5" stopColor="#13564f" />
          <stop offset="1" stopColor="#082a27" />
        </linearGradient>
        <linearGradient id={`se-la-velvet-wine-${side}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3b1020" />
          <stop offset=".5" stopColor="#5a1a2e" />
          <stop offset="1" stopColor="#2a0a16" />
        </linearGradient>
      </defs>
      {banners.map(([x, width, length, tone, delay]) => {
        const mid = x + width / 2;
        return (
          <g key={x} className="se-la__banner" style={{ animationDelay: delay } as CSSProperties}>
            <path
              d={`M${x} 26 H${x + width} V${length} L${mid} ${length - 34} L${x} ${length} Z`}
              fill={`url(#se-la-velvet-${tone}-${side})`}
              stroke="#e6c979"
              strokeOpacity=".75"
              strokeWidth="2.5"
            />
            <path d={`M${x + 8} 34 H${x + width - 8} V${length - 18} L${mid} ${length - 46} L${x + 8} ${length - 18} Z`} fill="none" stroke="#e6c979" strokeOpacity=".35" />
            <g fill="#e6c979" fillOpacity=".8">
              <Laurel cx={mid} cy={112} radius={width * 0.34} leaf={width * 0.075} />
              <Star cx={mid} cy={108} r={width * 0.14} />
            </g>
            <path d={`M${x + 18} ${length - 92} H${x + width - 18} M${x + 26} ${length - 80} H${x + width - 26}`} stroke="#e6c979" strokeOpacity=".5" strokeWidth="2" />
          </g>
        );
      })}
      <path d="M-20 22 H284" stroke="#c9a34e" strokeWidth="7" strokeLinecap="round" />
      <circle cx="288" cy="22" r="9" fill="#e6c979" />
    </svg>
  );
}

// Championship-hall backdrop for the Laurel Ascendant shell (`midnight-market`): velvet banners
// with laurel crests, crossing spotlights, a trophy on a plinth, a podium with a turning medal,
// and drifting gold flakes.
export default function LaurelAscendantScene() {
  return (
    <div className="se-theme-scene se-theme-scene--laurel-ascendant">
      <div className="se-la__spot se-la__spot--left" />
      <div className="se-la__spot se-la__spot--right" />
      <BannerRod side="left" />
      <BannerRod side="right" />

      <svg className="se-la__trophy" viewBox="0 0 300 340">
        <defs>
          <linearGradient id="se-la-gold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8a6a22" />
            <stop offset=".35" stopColor="#f5dc8e" />
            <stop offset=".6" stopColor="#c9a34e" />
            <stop offset="1" stopColor="#6e5218" />
          </linearGradient>
          <linearGradient id="se-la-marble" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1f2a30" />
            <stop offset="1" stopColor="#0b1013" />
          </linearGradient>
          <clipPath id="se-la-cup">
            <path d="M80 60 H220 C220 140 190 176 150 182 C110 176 80 140 80 60 Z" />
          </clipPath>
          <linearGradient id="se-la-glint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".7" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M80 76 C40 76 40 136 92 140 M220 76 C260 76 260 136 208 140" fill="none" stroke="url(#se-la-gold)" strokeWidth="9" />
        <path d="M80 60 H220 C220 140 190 176 150 182 C110 176 80 140 80 60 Z" fill="url(#se-la-gold)" />
        <g fill="#6e5218" fillOpacity=".55">
          <Laurel cx={150} cy={104} radius={34} leaf={7} />
          <Star cx={150} cy={102} r={13} />
        </g>
        <rect x="76" y="54" width="148" height="10" rx="3" fill="url(#se-la-gold)" />
        <path d="M140 182 H160 L164 222 H136 Z" fill="url(#se-la-gold)" />
        <path d="M108 222 H192 L200 244 H100 Z" fill="url(#se-la-gold)" />
        <g clipPath="url(#se-la-cup)">
          <rect className="se-la__glint" x="20" y="40" width="40" height="160" fill="url(#se-la-glint)" transform="skewX(-16)" />
        </g>
        <rect x="70" y="244" width="160" height="96" fill="url(#se-la-marble)" stroke="#e6c979" strokeOpacity=".35" />
        <rect x="70" y="256" width="160" height="5" fill="#c9a34e" fillOpacity=".6" />
        <rect x="104" y="280" width="92" height="30" rx="3" fill="#c9a34e" fillOpacity=".55" />
        <path d="M116 290 H184 M124 300 H176" stroke="#1a1205" strokeOpacity=".55" strokeWidth="3" />
      </svg>

      <svg className="se-la__podium" viewBox="0 0 360 320">
        <defs>
          <radialGradient id="se-la-medal" cx=".38" cy=".35" r=".7">
            <stop offset="0" stopColor="#fff2c0" />
            <stop offset=".5" stopColor="#e6c979" />
            <stop offset="1" stopColor="#8a6a22" />
          </radialGradient>
        </defs>
        <g fill="#16252b" stroke="#e6c979" strokeOpacity=".45" strokeWidth="2">
          <rect x="20" y="226" width="100" height="100" />
          <rect x="120" y="186" width="120" height="140" />
          <rect x="240" y="252" width="100" height="74" />
        </g>
        <g className="se-la__numeral">
          <text x="70" y="290" textAnchor="middle">2</text>
          <text x="180" y="262" textAnchor="middle">1</text>
          <text x="290" y="304" textAnchor="middle">3</text>
        </g>
        <path d="M156 40 L180 108 L204 40" fill="none" stroke="#14b8a6" strokeWidth="12" strokeLinejoin="round" />
        <path d="M168 40 L180 76 L192 40" fill="none" stroke="#f59e0b" strokeWidth="4" />
        <g className="se-la__medal">
          <circle cx="180" cy="138" r="34" fill="url(#se-la-medal)" stroke="#fff2c0" strokeOpacity=".7" strokeWidth="2" />
          <circle cx="180" cy="138" r="26" fill="none" stroke="#8a6a22" strokeOpacity=".6" />
          <g fill="#8a6a22" fillOpacity=".75">
            <Laurel cx={180} cy={140} radius={20} leaf={4.5} />
            <Star cx={180} cy={137} r={9} />
          </g>
        </g>
      </svg>

      <div className="se-la__flakes">
        {flakes.map(([left, delay, duration], index) => (
          <i key={index} style={{ left, animationDelay: delay, animationDuration: duration } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
