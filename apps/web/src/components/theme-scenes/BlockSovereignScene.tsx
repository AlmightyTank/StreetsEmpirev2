import type { CSSProperties } from 'react';

// Territory map across the sky: street lines, then districts that light up in turn as claims.
const streets = [
  'M0 70 L1600 40', 'M0 168 L1600 150', 'M0 262 L1600 270',
  'M150 0 L120 360', 'M410 0 L450 360', 'M690 0 L660 360', 'M960 0 L1010 360', 'M1240 0 L1210 360', 'M1470 0 L1500 360',
];
const districts = [
  'M150 64 L410 56 L420 160 L137 165 Z',
  'M420 160 L680 156 L670 262 L430 262 Z',
  'M960 46 L1240 40 L1232 151 L974 154 Z',
  'M1232 151 L1490 148 L1497 270 L1222 268 Z',
  'M690 50 L960 46 L974 154 L680 156 Z',
  'M137 165 L420 160 L430 262 L125 262 Z',
];

const birds = [[0, 0, '0s'], [36, -14, '-.3s'], [64, 6, '-.6s']] as const;

// Brick pattern for the parapets, painted dark with a hint of the shell's teal in the mortar.
function BrickDefs({ id }: { id: string }) {
  return (
    <pattern id={id} width="36" height="20" patternUnits="userSpaceOnUse">
      <rect width="36" height="20" fill="#2a1c19" />
      <path d="M0 0.5 H36 M0 10.5 H36 M0.5 0 V10 M18.5 10 V20" stroke="#5eead4" strokeOpacity=".16" />
    </pattern>
  );
}

function Crown({ x, y, scale }: { x: number; y: number; scale: number }) {
  return <path transform={`translate(${x} ${y}) scale(${scale})`} d="M0 30 L-4 0 L12 14 L22 -6 L32 14 L48 0 L44 30 Z M-2 34 H46 V40 H-2 Z" />;
}

// Rooftop backdrop for the Block Sovereign shell (`rain-city-wire`): a water tower on a painted
// brick parapet, a crown flag over a chain-link fence, and a territory map whose blocks get claimed.
export default function BlockSovereignScene() {
  return (
    <div className="se-theme-scene se-theme-scene--block-sovereign">
      <svg className="se-bs__map" viewBox="0 0 1600 360">
        <g className="se-bs__districts">
          {districts.map((d, index) => (
            <path key={index} d={d} style={{ animationDelay: `${index * 2}s` } as CSSProperties} />
          ))}
        </g>
        <g fill="none" stroke="#63e3c0" strokeOpacity=".2" strokeWidth="1.4">
          {streets.map((d) => <path key={d} d={d} />)}
        </g>
        <path className="se-bs__route" d="M137 165 L420 160 L680 156 L974 154 L1232 151 L1490 148" fill="none" stroke="#4ade80" strokeWidth="2" strokeDasharray="10 14" />
        <g className="se-bs__flock">
          {birds.map(([x, y, delay], index) => (
            <path key={index} className="se-bs__bird" d={`M${x - 9} ${y} Q${x - 4} ${y - 6} ${x} ${y} Q${x + 4} ${y - 6} ${x + 9} ${y}`} style={{ animationDelay: delay } as CSSProperties} />
          ))}
        </g>
      </svg>

      <svg className="se-bs__corner se-bs__corner--left" viewBox="0 0 420 420">
        <defs><BrickDefs id="se-bs-brick-left" /></defs>
        <g stroke="#1f3a3a" strokeWidth="6" strokeLinecap="round">
          <path d="M136 206 L126 352 M234 206 L244 352 M168 206 L166 352 M202 206 L204 352" />
          <path d="M131 270 L240 330 M240 270 L131 330 M128 312 L242 312" strokeWidth="3" />
        </g>
        <path d="M262 120 V352 M276 120 V352 M262 150 H276 M262 180 H276 M262 210 H276 M262 240 H276 M262 270 H276 M262 300 H276 M262 330 H276" stroke="#1f3a3a" strokeWidth="2.5" />
        <rect x="116" y="118" width="140" height="92" fill="#18292b" />
        <path d="M130 118 V210 M146 118 V210 M162 118 V210 M178 118 V210 M194 118 V210 M210 118 V210 M226 118 V210 M242 118 V210" stroke="#2b4446" strokeWidth="1.5" />
        <path d="M116 138 H256 M116 188 H256" stroke="#63e3c0" strokeOpacity=".4" strokeWidth="3" />
        <path d="M106 120 L186 64 L266 120 Z" fill="#14201f" stroke="#63e3c0" strokeOpacity=".35" strokeWidth="2" />
        <path d="M186 64 V48" stroke="#63e3c0" strokeOpacity=".5" strokeWidth="2.5" />
        <rect x="-20" y="350" width="440" height="90" fill="url(#se-bs-brick-left)" />
        <rect x="-20" y="342" width="440" height="10" fill="#3a2a26" />
        <rect x="398" y="332" width="28" height="108" fill="url(#se-bs-brick-left)" stroke="#5eead4" strokeOpacity=".18" />
        <rect x="394" y="324" width="36" height="10" fill="#3a2a26" />
        <g className="se-bs__tag" fill="#4ade80" fillOpacity=".55">
          <Crown x={150} y={372} scale={1} />
          <path d="M156 412 v10 M178 412 v14 M196 412 v8" stroke="#4ade80" strokeOpacity=".45" strokeWidth="2" />
        </g>
      </svg>

      <svg className="se-bs__corner se-bs__corner--right" viewBox="0 0 420 420">
        <defs>
          <BrickDefs id="se-bs-brick-right" />
          <pattern id="se-bs-chain" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="16" height="16" fill="none" stroke="#63e3c0" strokeOpacity=".22" strokeWidth="1.2" />
          </pattern>
          <linearGradient id="se-bs-flag" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#14b8a6" />
            <stop offset="1" stopColor="#0f766e" />
          </linearGradient>
        </defs>
        <rect x="40" y="214" width="360" height="132" fill="url(#se-bs-chain)" />
        <path d="M40 214 V346 M160 214 V346 M280 214 V346 M400 214 V346 M40 216 H400" stroke="#2b4446" strokeWidth="4" />
        <g className="se-bs__ivy" fill="#4ade80" fillOpacity=".5">
          {[[52, 330], [70, 312], [64, 292], [88, 336], [110, 322], [134, 338], [170, 328], [188, 306], [204, 334], [232, 318], [258, 336]].map(([x, y], index) => (
            <path key={index} d={`M${x} ${y} q 8 -10 16 0 q -8 10 -16 0 Z`} transform={`rotate(${(index * 47) % 90 - 45} ${x} ${y})`} />
          ))}
          <path d="M44 344 C70 320 60 300 70 284 M60 344 C110 330 150 340 200 320 C230 310 250 330 270 340" fill="none" stroke="#4ade80" strokeOpacity=".4" strokeWidth="2" />
        </g>
        <path d="M330 344 V36" stroke="#9fb7b4" strokeOpacity=".55" strokeWidth="5" />
        <circle cx="330" cy="32" r="6" fill="#facc15" fillOpacity=".75" />
        <g className="se-bs__flag">
          <path d="M328 46 C290 36 250 60 200 46 L194 126 C246 140 288 116 328 126 Z" fill="url(#se-bs-flag)" fillOpacity=".85" />
          <g fill="#e7fbf5" fillOpacity=".8"><Crown x={240} y={66} scale={0.8} /></g>
          <path className="se-bs__flag-sheen" d="M328 46 C290 36 250 60 200 46 L194 126 C246 140 288 116 328 126 Z" fill="#fff" fillOpacity=".12" />
        </g>
        <rect x="0" y="350" width="440" height="90" fill="url(#se-bs-brick-right)" />
        <rect x="0" y="342" width="440" height="10" fill="#3a2a26" />
        <rect x="-6" y="332" width="28" height="108" fill="url(#se-bs-brick-right)" stroke="#5eead4" strokeOpacity=".18" />
        <rect x="-10" y="324" width="36" height="10" fill="#3a2a26" />
      </svg>
    </div>
  );
}
