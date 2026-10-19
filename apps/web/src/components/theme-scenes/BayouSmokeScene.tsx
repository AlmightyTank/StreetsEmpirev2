import type { CSSProperties } from 'react';

// Deep in the swamp for the Bayou Smoke shell (`bayou-smoke-shell`, The Drop): cypress trees hung
// with moss, knees standing in still water, evening haze and fireflies drifting through it.
const fireflies = [
  ['58%', '62%', '-1s', '9s'], ['66%', '40%', '-4s', '11s'], ['74%', '70%', '-2s', '8s'], ['82%', '34%', '-6s', '12s'],
  ['88%', '58%', '-3s', '10s'], ['94%', '46%', '-7s', '9s'], ['70%', '20%', '-5s', '13s'], ['90%', '16%', '-8s', '10s'],
] as const;

const trees = [[300, 1], [410, 1.25], [510, 0.95]] as const;

export default function BayouSmokeScene() {
  return (
    <div className="se-theme-scene se-theme-scene--bayou-smoke">
      <svg className="se-by__swamp" viewBox="0 0 560 340" preserveAspectRatio="xMaxYMax meet">
        {trees.map(([x, scale], index) => (
          <g key={index} transform={`translate(${x} 300) scale(${scale})`}>
            {/* A buttressed cypress trunk, bare branches, ragged foliage and hanging moss. */}
            <path d="M-30 0 Q-14 -10 -10 -40 L-6 -200 L4 -200 L8 -40 Q12 -10 28 0 Z" fill="#0d140c" />
            <path d="M-6 -150 L-46 -190 M2 -170 L40 -214 M-2 -110 L-36 -130 M4 -126 L34 -150" stroke="#0d140c" strokeWidth="4" strokeLinecap="round" />
            <g fill="#121c10" stroke="#b6e05a" strokeOpacity=".12">
              <ellipse cx="-46" cy="-194" rx="22" ry="9" /><ellipse cx="40" cy="-218" rx="26" ry="10" /><ellipse cx="-2" cy="-206" rx="18" ry="9" />
              <ellipse cx="-36" cy="-134" rx="16" ry="7" /><ellipse cx="34" cy="-154" rx="18" ry="7" />
            </g>
            <path d="M-58 -190 q-3 26 2 50 M-40 -188 q-4 34 1 62 M24 -214 q-3 28 2 56 M48 -212 q4 30 -1 54 M-44 -132 q-2 18 2 34 M30 -150 q3 20 -1 38" stroke="#84937a" strokeOpacity=".45" strokeWidth="1.6" fill="none" />
          </g>
        ))}
        <rect x="0" y="300" width="560" height="40" fill="#080c07" />
        <g fill="#0d140c">
          <path d="M240 304 l6 -16 l6 16 Z M352 306 l5 -12 l5 12 Z M470 304 l7 -18 l7 18 Z" />
        </g>
        <g stroke="#b6e05a" strokeOpacity=".16" strokeWidth="2">
          <path d="M200 316 H320 M360 326 H500 M240 334 H300" />
        </g>
      </svg>
      <div className="se-by__haze" />
      <div className="se-by__fireflies">
        {fireflies.map(([left, top, delay, duration], index) => (
          <i key={index} style={{ left, top, animationDelay: delay, animationDuration: duration } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
