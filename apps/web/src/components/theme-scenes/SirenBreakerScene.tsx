import type { CSSProperties } from 'react';

type Point = readonly [number, number];

// Cracked-glass impact: jagged spokes out from the hit, joined by rings part-way along them.
const impact: Point = [250, 92];
const spokeAngles = [8, 44, 79, 118, 151, 190, 224, 262, 297, 333];
const steps = [0.18, 0.4, 0.66, 1];
function spokePoint(spokeIndex: number, degrees: number, stepIndex: number, step: number): Point {
  const angle = (degrees * Math.PI) / 180 + (stepIndex % 2 === 0 ? 0.07 : -0.06);
  const length = (150 + ((spokeIndex * 53) % 90)) * step;
  return [impact[0] + Math.cos(angle) * length, impact[1] + Math.sin(angle) * length];
}
const spokes = spokeAngles.map((degrees, spokeIndex) => steps.map((step, stepIndex) => spokePoint(spokeIndex, degrees, stepIndex, step)));
const rings = [0, 1].map((stepIndex) => spokeAngles.map((degrees, spokeIndex) => spokePoint(spokeIndex, degrees, stepIndex, steps[stepIndex] ?? 1)));
const glintSpoke = spokes[3] ?? [];
const polyline = (points: readonly Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

// Ripples in the puddles: [cx, cy, delay].
const ripples = [
  [110, 150, '0s'], [190, 156, '-1.1s'], [80, 160, '-2.3s'], [350, 120, '-0.6s'],
  [390, 124, '-1.8s'], [300, 180, '-2.9s'], [150, 146, '-3.4s'],
] as const;

// A strip of tape running off the left edge, torn at its right end.
const tapeShape = 'M-80 140 H530 L541 146 L532 152 L543 159 L533 166 L545 174 H-80 Z';

// Rain-soaked crime scene for the Siren Breaker shell (`blue-heat`): rain, red and blue siren
// washes, a helicopter searchlight, police tape, a cracked-glass impact and rippling puddles.
export default function SirenBreakerScene() {
  return (
    <div className="se-theme-scene se-theme-scene--siren-breaker">
      <div className="se-sb__siren se-sb__siren--red" />
      <div className="se-sb__siren se-sb__siren--blue" />
      <div className="se-sb__searchlight" />
      <div className="se-sb__rain se-sb__rain--far" />
      <div className="se-sb__rain se-sb__rain--near" />

      <svg className="se-sb__glass" viewBox="0 0 360 300">
        <g fill="none" stroke="#dbe8ff" strokeLinejoin="round">
          {spokes.map((points, index) => (
            <polyline key={index} points={polyline([impact, ...points])} strokeOpacity=".5" strokeWidth={index % 3 === 0 ? 1.6 : 1} />
          ))}
          {rings.map((points, index) => (
            <polygon key={index} points={polyline(points)} strokeOpacity=".32" strokeWidth=".9" />
          ))}
          <polyline className="se-sb__glass-glint" points={polyline([impact, ...glintSpoke])} stroke="#fff" strokeWidth="2" />
        </g>
        <circle cx={impact[0]} cy={impact[1]} r="7" fill="#dbe8ff" fillOpacity=".35" />
      </svg>

      <svg className="se-sb__puddles" viewBox="0 0 480 200">
        <defs>
          <radialGradient id="se-sb-red">
            <stop offset="0" stopColor="#e92048" stopOpacity=".7" />
            <stop offset="1" stopColor="#e92048" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="se-sb-blue">
            <stop offset="0" stopColor="#6899f3" stopOpacity=".75" />
            <stop offset="1" stopColor="#6899f3" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g fill="#0b1322" stroke="#6899f3" strokeOpacity=".25">
          <ellipse cx="140" cy="152" rx="124" ry="22" />
          <ellipse cx="368" cy="122" rx="92" ry="16" />
          <ellipse cx="300" cy="182" rx="72" ry="12" />
        </g>
        <g className="se-sb__flash se-sb__flash--red">
          <ellipse cx="110" cy="152" rx="80" ry="16" fill="url(#se-sb-red)" />
          <ellipse cx="290" cy="182" rx="50" ry="9" fill="url(#se-sb-red)" />
        </g>
        <g className="se-sb__flash se-sb__flash--blue">
          <ellipse cx="190" cy="152" rx="80" ry="16" fill="url(#se-sb-blue)" />
          <ellipse cx="380" cy="122" rx="66" ry="12" fill="url(#se-sb-blue)" />
        </g>
        <g fill="none" stroke="#dbe8ff" strokeWidth="1.2">
          {ripples.map(([cx, cy, delay], index) => (
            <ellipse key={index} className="se-sb__ripple" cx={cx} cy={cy} rx="16" ry="3.5" style={{ animationDelay: delay } as CSSProperties} />
          ))}
        </g>
      </svg>

      <svg className="se-sb__tape" viewBox="0 0 520 320">
        <defs>
          <clipPath id="se-sb-tape">
            <path d={tapeShape} />
          </clipPath>
        </defs>
        {[
          ['se-sb__tape-band', 'rotate(-17 260 160) translate(0 40)'],
          ['se-sb__tape-band se-sb__tape-band--low', 'rotate(11 260 160) translate(0 112)'],
        ].map(([className, transform]) => (
          <g key={transform} transform={transform}>
            <g className={className}>
              <path d={tapeShape} fill="#facc15" fillOpacity=".86" />
              <g clipPath="url(#se-sb-tape)">
                <path d="M-80 142 H560 M-80 172 H560" stroke="#1a1505" strokeOpacity=".5" strokeWidth="2" />
                <text x="-60" y="163" className="se-sb__tape-type">POLICE LINE · DO NOT CROSS · POLICE LINE · DO NOT CROSS ·</text>
              </g>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
