import type { CSSProperties } from 'react';

// The serpent glides along this route; segments follow at a fixed time spacing so the body
// trails the head through every curve. Index 0 is the head.
const route = 'M-260 760 C120 640 260 300 640 360 S1140 700 1420 470 S1760 160 1960 140';
const segmentCount = 30;
const spacing = 0.32;
const travel = 26;
const segments = Array.from({ length: segmentCount }, (_, index) => ({
  index,
  begin: `${-((segmentCount - index) * spacing + 9).toFixed(2)}s`,
  scale: index < 20 ? 1 : 1 - (index - 19) * 0.075,
}));

function SerpentSegment({ index, scale }: { index: number; scale: number }) {
  if (index === 0) {
    return (
      <g className="se-cs__head">
        <path className="se-cs__tongue" d="M30 0 H44 M44 0 L50 -4 M44 0 L50 4" />
        <path d="M-14 -15 C6 -17 24 -9 32 0 C24 9 6 17 -14 15 Z" fill="url(#se-cs-chrome)" stroke="#e2e8f0" strokeOpacity=".6" />
        <path d="M-4 -6 L8 -10 L20 -4 M-4 6 L8 10 L20 4" fill="none" stroke="#91dbe4" strokeOpacity=".8" strokeWidth="1.5" />
        <circle cx="16" cy="-6" r="2.4" fill="#f59e0b" />
        <circle cx="16" cy="6" r="2.4" fill="#f59e0b" />
      </g>
    );
  }
  return (
    <g transform={`scale(${scale.toFixed(3)})`}>
      <ellipse rx="17" ry="13.5" fill="url(#se-cs-chrome)" stroke="#e2e8f0" strokeOpacity=".45" />
      <path d="M-7 0 L0 -5.5 L7 0 L0 5.5 Z" fill="#91dbe4" fillOpacity=".75" />
      <ellipse className="se-cs__shine" cy="-6" rx="10" ry="3" fill="#fff" style={{ animationDelay: `${(index * 0.09).toFixed(2)}s` } as CSSProperties} />
    </g>
  );
}

const tires = [[300, 196], [300, 160], [300, 124]] as const;

// Midnight-garage backdrop for the Chrome Serpent shell (`motor-city-iron`): a chrome serpent
// gliding along route-map lines, a swinging shop lamp, a roll-up door, a classic car's grille
// and a tire stack beside an oil drum.
export default function ChromeSerpentScene() {
  return (
    <div className="se-theme-scene se-theme-scene--chrome-serpent">
      <svg className="se-cs__wall" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="se-cs-chrome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f1f5f9" />
            <stop offset=".45" stopColor="#94a3b8" />
            <stop offset=".55" stopColor="#475569" />
            <stop offset="1" stopColor="#cbd5e1" />
          </linearGradient>
          <path id="se-cs-route" d={route} />
        </defs>
        <g fill="none" stroke="#91dbe4" strokeOpacity=".16" strokeWidth="2" strokeDasharray="14 10">
          <use href="#se-cs-route" />
          <path d="M-100 180 C300 260 520 120 900 200 S1400 120 1700 260" />
          <path d="M200 960 C360 700 820 860 1000 640 S1300 360 1700 520" />
        </g>
        <g className="se-cs__serpent">
          {[...segments].reverse().map(({ index, begin, scale }) => (
            <g key={index}>
              <animateMotion dur={`${travel}s`} begin={begin} repeatCount="indefinite" rotate="auto">
                <mpath href="#se-cs-route" />
              </animateMotion>
              <g transform="scale(1.35)">
                <SerpentSegment index={index} scale={scale} />
              </g>
            </g>
          ))}
        </g>
      </svg>

      <svg className="se-cs__lamp" viewBox="0 0 300 380">
        <defs>
          <linearGradient id="se-cs-lamp-cone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbbf24" stopOpacity=".32" />
            <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="se-cs__lamp-swing">
          <path d="M150 -10 V70" stroke="#64748b" strokeWidth="3" strokeDasharray="6 3" />
          <path d="M70 380 L130 108 H170 L230 380 Z" fill="url(#se-cs-lamp-cone)" />
          <path d="M138 70 H162 L188 104 H112 Z" fill="#334155" stroke="#94a3b8" strokeOpacity=".6" />
          <ellipse cx="150" cy="106" rx="20" ry="5" fill="#fde68a" />
        </g>
      </svg>

      <svg className="se-cs__door" viewBox="0 0 360 260">
        <defs>
          <linearGradient id="se-cs-slat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#475569" />
            <stop offset=".5" stopColor="#1e293b" />
            <stop offset="1" stopColor="#334155" />
          </linearGradient>
          <clipPath id="se-cs-door-face">
            <rect x="40" y="0" width="330" height="214" />
          </clipPath>
        </defs>
        <rect x="24" y="-10" width="16" height="250" fill="#1f2937" />
        <g clipPath="url(#se-cs-door-face)">
          {Array.from({ length: 11 }, (_, index) => (
            <rect key={index} x="40" y={index * 20} width="330" height="19" fill="url(#se-cs-slat)" />
          ))}
          <rect className="se-cs__door-sheen" x="40" y="-60" width="330" height="40" fill="#e2e8f0" fillOpacity=".12" />
        </g>
        <rect x="40" y="208" width="330" height="8" fill="#94a3b8" fillOpacity=".7" />
        <path d="M40 216 L20 260 H390 L370 216 Z" fill="#fbbf24" fillOpacity=".08" />
        <text x="205" y="128" textAnchor="middle" className="se-cs__stencil">BAY 3</text>
      </svg>

      <svg className="se-cs__car" viewBox="0 0 420 260">
        <defs>
          <radialGradient id="se-cs-headlight">
            <stop offset="0" stopColor="#fff7d6" />
            <stop offset=".5" stopColor="#fde68a" stopOpacity=".6" />
            <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="se-cs-chrome-car" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f1f5f9" />
            <stop offset=".5" stopColor="#64748b" />
            <stop offset="1" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
        <path d="M-240 90 Q-200 40 40 36 Q280 40 320 90 L340 210 H-260 Z" fill="#141414" stroke="#94a3b8" strokeOpacity=".35" />
        <path d="M-160 40 Q40 0 240 40" fill="none" stroke="#91dbe4" strokeOpacity=".25" strokeWidth="3" />
        <rect x="-120" y="110" width="320" height="64" rx="8" fill="#0b0b0b" stroke="url(#se-cs-chrome-car)" strokeWidth="4" />
        <g stroke="#cbd5e1" strokeOpacity=".7" strokeWidth="3">
          {Array.from({ length: 13 }, (_, index) => <path key={index} d={`M${-104 + index * 24} 116 V168`} />)}
        </g>
        <circle cx="262" cy="140" r="30" fill="#0b0b0b" stroke="#e2e8f0" strokeOpacity=".8" strokeWidth="4" />
        <circle className="se-cs__headlight" cx="262" cy="140" r="34" fill="url(#se-cs-headlight)" />
        <rect x="-260" y="190" width="620" height="22" rx="11" fill="url(#se-cs-chrome-car)" fillOpacity=".85" />
        <rect className="se-cs__bumper-glint" x="-60" y="193" width="60" height="6" rx="3" fill="#fff" />
      </svg>

      <svg className="se-cs__tires" viewBox="0 0 420 260">
        <g>
          <rect x="70" y="120" width="96" height="130" fill="#1f2937" stroke="#64748b" strokeOpacity=".6" />
          <ellipse cx="118" cy="120" rx="48" ry="12" fill="#334155" stroke="#94a3b8" strokeOpacity=".6" />
          <path d="M70 160 H166 M70 210 H166" stroke="#64748b" strokeWidth="4" />
          <rect x="94" y="172" width="48" height="28" fill="#d97706" fillOpacity=".75" />
          <path d="M118 176 L132 196 H104 Z" fill="#1a1205" />
        </g>
        {tires.map(([cx, cy], index) => (
          <g key={index}>
            <rect x={cx - 74} y={cy} width="148" height="36" fill="#111" />
            <path d={`M${cx - 74} ${cy + 8} H${cx + 74} M${cx - 74} ${cy + 18} H${cx + 74} M${cx - 74} ${cy + 28} H${cx + 74}`} stroke="#334155" strokeWidth="2" strokeDasharray="8 6" />
            <ellipse cx={cx} cy={cy} rx="74" ry="18" fill="#1a1a1a" stroke="#475569" />
            <ellipse cx={cx} cy={cy} rx="34" ry="8" fill="#050505" stroke="#94a3b8" strokeOpacity=".5" />
          </g>
        ))}
      </svg>
    </div>
  );
}
