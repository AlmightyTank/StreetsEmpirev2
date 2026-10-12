import type { CSSProperties } from 'react';

// Dust drifting inside the window light; positions are in the light SVG's viewBox.
const dust = [
  [612, 214, '-2s', '15s', 2.2], [560, 292, '-9s', '19s', 1.6], [668, 330, '-5s', '17s', 2.6],
  [512, 384, '-12s', '21s', 1.8], [610, 430, '-7s', '16s', 2], [700, 470, '-3s', '18s', 1.5],
  [548, 520, '-10s', '20s', 2.4], [646, 584, '-6s', '15s', 1.7], [596, 646, '-14s', '22s', 2.1],
  [742, 252, '-4s', '19s', 1.9],
] as const;

// Sheriff's-office backdrop for the Dead-or-Alive shell (`federal-case`): a blinds-striped
// window shaft that a ceiling fan's shadow sweeps through, and case files pinned to the wall.
export default function DeadOrAliveScene() {
  return (
    <div className="se-theme-scene se-theme-scene--dead-or-alive">
      <svg className="se-doa__light" viewBox="0 0 1000 900" preserveAspectRatio="xMaxYMin slice">
        <defs>
          <linearGradient id="se-doa-beam" x1="1" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor="#f6dfa8" stopOpacity=".5" />
            <stop offset=".55" stopColor="#e2c27e" stopOpacity=".2" />
            <stop offset="1" stopColor="#caa86d" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="se-doa-patch" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6dfa8" stopOpacity=".34" />
            <stop offset="1" stopColor="#caa86d" stopOpacity=".1" />
          </linearGradient>
          <pattern id="se-doa-blinds" width="40" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
            <rect width="40" height="15" fill="#fff" />
          </pattern>
          <mask id="se-doa-blinds-mask">
            <rect width="1000" height="900" fill="url(#se-doa-blinds)" />
          </mask>
          <clipPath id="se-doa-shaft">
            <path d="M836 -10 L1010 -10 L1010 70 L780 770 L410 860 L350 430 Z" />
          </clipPath>
        </defs>

        <g clipPath="url(#se-doa-shaft)">
          <path className="se-doa__beam" d="M836 -10 L1010 -10 L1010 70 L780 770 L410 860 L350 430 Z" fill="url(#se-doa-beam)" />
          <g mask="url(#se-doa-blinds-mask)">
            <path className="se-doa__patch" d="M350 430 L700 336 L780 770 L410 860 Z" fill="url(#se-doa-patch)" />
          </g>
          {/* Window mullions, cast into the patch. */}
          <path d="M525 383 L595 815 M380 645 L740 553" stroke="#05070a" strokeOpacity=".7" strokeWidth="14" fill="none" />
          <g className="se-doa__fan" fill="#05070a" fillOpacity=".62">
            {[0, 90, 180, 270].map((angle) => (
              <path key={angle} transform={`rotate(${angle} 700 150)`} d="M700 150 C 740 120, 930 96, 1010 122 C 1030 150, 930 176, 700 160 Z" />
            ))}
          </g>
        </g>

        <g className="se-doa__dust" fill="#ffe9b8">
          {dust.map(([cx, cy, delay, duration, r], index) => (
            <circle key={index} cx={cx} cy={cy} r={r} style={{ animationDelay: delay, animationDuration: duration } as CSSProperties} />
          ))}
        </g>
      </svg>

      <svg className="se-doa__board" viewBox="0 0 460 660">
        <defs>
          <linearGradient id="se-doa-paper" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e6cc93" stopOpacity=".34" />
            <stop offset="1" stopColor="#b48e52" stopOpacity=".22" />
          </linearGradient>
        </defs>

        {/* Red cord strung between the pins; drawn first so the papers sit over it. */}
        <path
          className="se-doa__cord"
          d="M-20 70 Q 70 104 158 44 Q 236 212 300 318 Q 186 372 92 430"
          fill="none"
          stroke="#c0453a"
          strokeOpacity=".75"
          strokeWidth="2.4"
        />

        <g className="se-doa__sheet se-doa__sheet--poster">
          <g transform="rotate(-6 158 44)">
            <path
              d="M48 40 H268 V318 L252 326 L238 316 L222 328 L204 318 L186 330 L168 318 L150 327 L132 316 L112 329 L96 318 L78 328 L62 317 L48 324 Z"
              fill="url(#se-doa-paper)"
              stroke="#e6cc93"
              strokeOpacity=".45"
            />
            <text x="158" y="92" textAnchor="middle" className="se-doa__type se-doa__type--big">WANTED</text>
            <rect x="96" y="108" width="124" height="112" fill="#05070a" fillOpacity=".5" stroke="#e6cc93" strokeOpacity=".4" />
            <path d="M158 132 a20 22 0 1 1 -0.1 0 Z M118 220 C 120 186, 140 172, 158 172 C 176 172, 196 186, 198 220 Z" fill="#caa86d" fillOpacity=".35" />
            <text x="158" y="248" textAnchor="middle" className="se-doa__type">DEAD OR ALIVE</text>
            <path d="M82 268 H234 M98 284 H218 M110 300 H206" stroke="#e6cc93" strokeOpacity=".4" strokeWidth="5" />
          </g>
          <circle cx="158" cy="44" r="6" fill="#c0453a" />
        </g>

        <g className="se-doa__sheet se-doa__sheet--card">
          <g transform="rotate(9 300 318)">
            <rect x="214" y="310" width="190" height="138" fill="url(#se-doa-paper)" stroke="#e6cc93" strokeOpacity=".45" />
            <path d="M232 340 H330 M232 360 H382 M232 380 H360 M232 400 H374 M232 420 H310" stroke="#e6cc93" strokeOpacity=".35" strokeWidth="4" />
            {/* Wax seal with a sheriff's star. */}
            <circle cx="360" cy="410" r="26" fill="#9c2f27" fillOpacity=".8" stroke="#c0453a" strokeWidth="3" />
            <path d="M360 392 L365 404 L378 405 L368 413 L371 426 L360 419 L349 426 L352 413 L342 405 L355 404 Z" fill="#e6cc93" fillOpacity=".7" />
          </g>
          <circle cx="300" cy="318" r="6" fill="#c0453a" />
        </g>

        <g className="se-doa__sheet se-doa__sheet--photo">
          <g transform="rotate(-4 92 430)">
            <rect x="22" y="424" width="150" height="176" fill="#e6cc93" fillOpacity=".3" stroke="#e6cc93" strokeOpacity=".45" />
            <rect x="34" y="436" width="126" height="122" fill="#05070a" fillOpacity=".6" />
            <path d="M34 558 V522 H52 V506 H68 V528 H86 V496 H100 V516 H118 V530 H138 V510 H160 V558 Z" fill="#71b8e6" fillOpacity=".28" />
            <path d="M50 578 H140" stroke="#05070a" strokeOpacity=".5" strokeWidth="4" />
          </g>
          <circle cx="92" cy="430" r="6" fill="#c0453a" />
        </g>
      </svg>
    </div>
  );
}
