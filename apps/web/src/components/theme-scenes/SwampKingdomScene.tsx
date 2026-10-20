import type { CSSProperties } from 'react';

// Old Gregg's loch for the Swamp Kingdom shell (`swamp-kingdom-shell`, The Drop): far hills, a
// still loch, Gregg himself peeping out of the water by the reeds and a glass of Baileys on a rock.
const bubbles = [['60%', '78%', '-2s'], ['68%', '70%', '-5s'], ['74%', '82%', '-1s'], ['84%', '74%', '-7s'], ['90%', '80%', '-4s']] as const;

export default function SwampKingdomScene() {
  return (
    <div className="se-theme-scene se-theme-scene--swamp-kingdom">
      <svg className="se-sk__hill" viewBox="0 0 560 340" preserveAspectRatio="xMaxYMax meet">
        {/* Far hills and the loch. */}
        <path d="M120 250 Q260 170 380 210 Q470 160 560 190 V260 H120 Z" fill="#141c12" />
        <path d="M80 262 Q320 248 560 256 V340 H80 Z" fill="#0d1a17" />
        <g stroke="#7aa83a" strokeOpacity=".16" strokeWidth="2" strokeLinecap="round">
          <path d="M150 276 H220 M300 290 H380 M440 272 H520 M200 312 H260" />
        </g>
        {/* Old Gregg, bobbing in the water. */}
        <g className="se-sk__gregg">
          <g transform="translate(400 262)">
            <path d="M-34 -22 L-56 -38 L-48 -24 L-62 -20 L-48 -14 L-56 -4 L-34 -8 Z M34 -22 L56 -38 L48 -24 L62 -20 L48 -14 L56 -4 L34 -8 Z" fill="#d9884a" opacity=".75" />
            <path d="M-36 4 Q-38 -46 0 -48 Q38 -46 36 4 Z" fill="#4e5a24" />
            <path d="M-22 -40 Q-36 -30 -38 -6 M-14 -44 Q-30 -36 -32 -10 M22 -40 Q36 -30 38 -6 M14 -44 Q30 -36 32 -10 M-18 -44 Q0 -52 18 -44" stroke="#17110a" strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="-14" cy="-22" r="10" fill="#ece0a2" /><circle cx="15" cy="-23" r="11" fill="#ece0a2" />
            <path d="M-24 -24 A10 10 0 0 1 -4 -24 Z M4 -25 A11 11 0 0 1 26 -25 Z" fill="#6a7634" />
            <circle cx="-12" cy="-19" r="3" fill="#0b0b0b" /><circle cx="13" cy="-20" r="3.2" fill="#0b0b0b" />
            <path d="M-20 -4 Q0 4 20 -4" stroke="#2a0a0c" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
          <path d="M350 266 Q400 258 450 266" stroke="#7aa83a" strokeOpacity=".35" strokeWidth="2" fill="none" />
        </g>
        {/* Foreground: a rock with a glass of Baileys, and the reeds. */}
        <path d="M0 340 V306 Q140 292 300 302 T560 298 V340 Z" fill="#0b1009" />
        <g transform="translate(170 300)">
          <path d="M-40 4 Q-36 -20 -6 -24 Q30 -26 40 4 Z" fill="#1b2418" stroke="#7aa83a" strokeOpacity=".2" />
          <path d="M-6 -24 L6 -24 L8 -46 L-8 -46 Z" fill="#dfeff2" fillOpacity=".25" stroke="#f4fbff" strokeOpacity=".5" />
          <path d="M-6.2 -26 L6.2 -26 L7.2 -37 L-7.2 -37 Z" fill="#c9a46e" opacity=".85" />
        </g>
        <g stroke="#3d5a24" strokeWidth="3" strokeLinecap="round">
          <path d="M60 314 V270 M70 316 V262 M82 314 V276 M290 304 V270 M302 306 V262 M520 302 V266 M532 304 V256" />
        </g>
      </svg>
      <div className="se-sk__motes">
        {bubbles.map(([left, top, delay], index) => (
          <i key={index} style={{ left, top, animationDelay: delay } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
