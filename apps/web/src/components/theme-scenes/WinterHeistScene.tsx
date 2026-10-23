import type { CSSProperties } from 'react';

// Cold-job dusk for the Winter Heist shell (`winter-heist-shell`, The Drop): snow falling over a
// frosted skyline, a vault door's dial in the top corner and frost creeping in from the edges.
// Under reduced motion the snow holds still where it is.
const flakes = [
  ['3%', '-2s', '14s', 4], ['10%', '-9s', '18s', 3], ['17%', '-5s', '15s', 5], ['24%', '-12s', '20s', 3],
  ['31%', '-3s', '16s', 4], ['38%', '-10s', '19s', 3], ['46%', '-6s', '14s', 5], ['53%', '-1s', '17s', 3],
  ['60%', '-8s', '15s', 4], ['67%', '-13s', '21s', 3], ['74%', '-4s', '16s', 5], ['81%', '-11s', '18s', 3],
  ['88%', '-7s', '15s', 4], ['95%', '-2s', '19s', 3],
] as const;

const skyline = 'M0 300 V210 H40 V170 H70 V200 H96 V140 H130 V190 H160 V120 H186 V100 H200 V120 H220 V180 H250 V150 H290 V200 H320 V160 H350 V130 H380 V190 H420 V170 H460 V210 H520 V300 Z';

export default function WinterHeistScene() {
  return (
    <div className="se-theme-scene se-theme-scene--winter-heist">
      <svg className="se-wh__vault" viewBox="0 0 260 260">
        <g fill="none" stroke="#bfe6ff" strokeOpacity=".35">
          <circle cx="200" cy="60" r="150" strokeWidth="2" />
          <circle cx="200" cy="60" r="118" strokeWidth="1" strokeDasharray="4 6" />
          <g className="se-wh__dial">
            <circle cx="200" cy="60" r="70" strokeWidth="3" />
            {Array.from({ length: 24 }, (_, index) => {
              const angle = (index / 24) * Math.PI * 2;
              const inner = index % 6 === 0 ? 54 : 61;
              return <path key={index} d={`M${200 + Math.cos(angle) * inner} ${60 + Math.sin(angle) * inner} L${200 + Math.cos(angle) * 68} ${60 + Math.sin(angle) * 68}`} strokeWidth="2" />;
            })}
          </g>
        </g>
      </svg>
      <svg className="se-wh__skyline" viewBox="0 0 520 300" preserveAspectRatio="xMaxYMax meet">
        <path d={skyline} fill="#0c1823" stroke="#8fd3ff" strokeOpacity=".35" strokeWidth="1.2" />
        <path d="M0 212 H40 V172 H70 M96 142 H130 M160 122 H186 V102 H200 V122 H220 M250 152 H290 M320 162 H350 V132 H380 M420 172 H460 V212 H520" stroke="#ffffff" strokeOpacity=".75" strokeWidth="4" strokeLinecap="round" fill="none" />
        <g fill="#cfe9fb" opacity=".55">
          <rect x="104" y="160" width="6" height="8" /><rect x="168" y="140" width="6" height="8" /><rect x="262" y="170" width="6" height="8" />
          <rect x="358" y="150" width="6" height="8" /><rect x="430" y="186" width="6" height="8" />
        </g>
      </svg>
      <div className="se-wh__frost" />
      <div className="se-wh__snow">
        {flakes.map(([left, delay, duration, size], index) => (
          <i key={index} style={{ left, animationDelay: delay, animationDuration: duration, width: size, height: size } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
