import type { CSSProperties } from 'react';

// The city after the outbreak for the Zombie Apocalypse shell (`zombie-apocalypse-shell`, The
// Drop): a broken skyline, a barricade of cars and plywood across the street, and the horde
// shambling slowly in along the horizon under a sick green sky.
const horde = [
  ['-2s', '46s', 1], ['-14s', '52s', 0.85], ['-25s', '48s', 1.1], ['-33s', '56s', 0.9], ['-40s', '50s', 1],
] as const;

export default function ZombieApocalypseScene() {
  return (
    <div className="se-theme-scene se-theme-scene--zombie-apocalypse">
      <div className="se-za__sky" />
      <svg className="se-za__city" viewBox="0 0 560 340" preserveAspectRatio="xMaxYMax meet">
        {/* Broken towers with a few windows still lit, one smoking. */}
        <g fill="#14160f" stroke="#9ccf4a" strokeOpacity=".1">
          <path d="M180 260 V150 H230 V170 L238 160 V260 Z" />
          <path d="M250 260 V110 H300 V128 L292 140 L300 150 V260 Z" />
          <path d="M320 260 V170 H370 V260 Z" />
          <path d="M390 260 V96 H440 V120 L430 126 V260 Z" />
          <path d="M460 260 V140 H520 V260 Z" />
        </g>
        <g fill="#ffd36a" opacity=".45">
          <rect x="262" y="160" width="6" height="8" /><rect x="402" y="180" width="6" height="8" /><rect x="482" y="200" width="6" height="8" />
        </g>
        <path className="se-za__smoke" d="M415 96 q-10 -20 4 -36 q12 -16 -2 -34" stroke="#6a6e5a" strokeOpacity=".5" strokeWidth="10" strokeLinecap="round" fill="none" />
        <rect x="0" y="260" width="560" height="80" fill="#0a0b08" />
        {/* The barricade: a burnt-out car on its side, plywood, sandbags and a QUARANTINE sign. */}
        <g transform="translate(250 304)">
          <path d="M0 0 V-34 Q2 -40 10 -40 H86 Q94 -40 96 -34 V0 Z" fill="#2a2620" stroke="#5a3a1a" strokeWidth="1.2" />
          <circle cx="22" cy="-44" r="9" fill="#141414" /><circle cx="74" cy="-44" r="9" fill="#141414" />
          <path d="M110 0 L118 -56 L150 -52 L146 0 Z" fill="#8a7454" stroke="#4a3a24" />
          <path d="M156 0 L162 -46 L192 -48 L190 0 Z" fill="#7a6648" stroke="#4a3a24" />
          <g fill="#4a4636" stroke="#2a281e">
            <ellipse cx="210" cy="-6" rx="16" ry="7" /><ellipse cx="240" cy="-6" rx="16" ry="7" /><ellipse cx="225" cy="-18" rx="16" ry="7" />
          </g>
          <rect x="114" y="-44" width="72" height="16" rx="1" fill="#ff6b2c" transform="rotate(-4 150 -36)" />
          <text x="150" y="-32" textAnchor="middle" fontSize="10" fontWeight="900" letterSpacing="1" fill="#1a0c06" transform="rotate(-4 150 -36)">QUARANTINE</text>
        </g>
      </svg>
      <div className="se-za__horde">
        {horde.map(([delay, duration, scale], index) => (
          <svg key={index} viewBox="0 0 20 40" style={{ animationDelay: delay, animationDuration: duration, '--se-za-scale': scale } as CSSProperties}>
            {/* A shambling silhouette: hunched, one arm reaching forward. */}
            <g className="se-za__shamble" fill="#1e2216">
              <circle cx="8" cy="6" r="4" />
              <path d="M5 10 Q12 10 13 20 L12 28 L14 40 H10 L8 30 L5 40 H1 L4 26 Q3 16 5 10 Z" />
              <path d="M10 13 L19 16 L18 18 L9 16 Z" />
            </g>
          </svg>
        ))}
      </div>
    </div>
  );
}
