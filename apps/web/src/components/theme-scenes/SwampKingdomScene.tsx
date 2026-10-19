import type { CSSProperties } from 'react';

// A fairy-tale bog for the Swamp Kingdom shell (`swamp-kingdom-shell`, The Drop): a crooked
// outhouse with a KEEP OUT sign in the reeds, a castle on the far hill and a dragon circling it.
const motes = [['60%', '64%', '-2s'], ['70%', '48%', '-5s'], ['80%', '70%', '-1s'], ['90%', '54%', '-7s'], ['76%', '30%', '-4s']] as const;

export default function SwampKingdomScene() {
  return (
    <div className="se-theme-scene se-theme-scene--swamp-kingdom">
      <svg className="se-sk__hill" viewBox="0 0 560 340" preserveAspectRatio="xMaxYMax meet">
        {/* The far hill and castle, with a small dragon looping round the towers. */}
        <path d="M120 300 Q300 150 560 190 V300 Z" fill="#141c12" />
        <g fill="#1b2418" stroke="#7aa83a" strokeOpacity=".2">
          <rect x="360" y="132" width="90" height="56" />
          <rect x="350" y="104" width="20" height="84" /><rect x="440" y="104" width="20" height="84" /><rect x="395" y="92" width="20" height="96" />
          <path d="M346 104 L360 82 L374 104 Z M436 104 L450 82 L464 104 Z M391 92 L405 64 L419 92 Z" />
        </g>
        <g fill="#ffd36a" opacity=".55"><rect x="400" y="112" width="8" height="12" rx="4" /><rect x="378" y="150" width="7" height="10" /><rect x="425" y="150" width="7" height="10" /></g>
        <g className="se-sk__orbit">
          <g className="se-sk__dragon" fill="#2a1f1a">
            <path d="M0 0 q14 -6 26 0 q-8 4 -12 4 Z" />
            <path d="M8 -1 L2 -14 L16 -3 Z M14 -1 L22 -12 L20 -1 Z" />
          </g>
        </g>
        {/* Foreground: reeds, a mud bank and the outhouse. */}
        <path d="M0 340 V300 Q140 284 300 296 T560 292 V340 Z" fill="#0b1009" />
        <g transform="translate(150 300)">
          <path d="M-30 0 V-96 L0 -112 L30 -96 V0 Z" fill="#2a2016" stroke="#7aa83a" strokeOpacity=".25" />
          <path d="M-6 -92 a6 9 0 1 0 12 0 a6 9 0 1 0 -12 0" fill="#0b1009" opacity=".8" />
          <rect x="-20" y="-64" width="40" height="18" rx="2" fill="#c9a46a" transform="rotate(-6)" />
          <text x="0" y="-51" textAnchor="middle" fontSize="9" fontWeight="700" fill="#5a2a12" transform="rotate(-6)">KEEP OUT</text>
        </g>
        <g stroke="#3d5a24" strokeWidth="3" strokeLinecap="round">
          <path d="M60 310 V270 M70 312 V262 M82 310 V276 M220 306 V272 M232 308 V264 M520 304 V268 M532 306 V258" />
        </g>
      </svg>
      <div className="se-sk__motes">
        {motes.map(([left, top, delay], index) => (
          <i key={index} style={{ left, top, animationDelay: delay } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
