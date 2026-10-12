import type { CSSProperties } from 'react';

type Point = readonly [number, number];
type Tone = 'red' | 'amber';
type Strand = { from: Point; sag: Point; to: Point; back?: boolean; lanterns: readonly (readonly [number, number, Tone])[] };

// Each corner ties two strands to an eave and runs them up out of view toward the middle,
// so page headings stay clear. Each lantern is [t along the strand, drop length, tone].
const leftStrands: readonly Strand[] = [
  { from: [-20, 34], sag: [210, 150], to: [440, 4], back: true, lanterns: [[0.32, 14, 'amber'], [0.64, 22, 'red']] },
  { from: [-20, 70], sag: [190, 250], to: [440, -24], lanterns: [[0.17, 30, 'red'], [0.4, 56, 'amber'], [0.66, 24, 'red']] },
];
const rightStrands: readonly Strand[] = [
  { from: [-20, 34], sag: [210, 150], to: [440, 4], back: true, lanterns: [[0.26, 20, 'red'], [0.56, 12, 'amber']] },
  { from: [-20, 70], sag: [190, 250], to: [440, -24], lanterns: [[0.21, 44, 'amber'], [0.45, 20, 'red'], [0.7, 46, 'amber']] },
];

function pointOn([x0, y0]: Point, [cx, cy]: Point, [x1, y1]: Point, t: number): Point {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

const sparks = [
  ['8%', '-3s', '11s'], ['17%', '-8s', '14s'], ['29%', '-1s', '12s'], ['41%', '-10s', '15s'],
  ['58%', '-5s', '13s'], ['69%', '-12s', '16s'], ['81%', '-2s', '12s'], ['92%', '-7s', '14s'],
] as const;

function Lantern({ x, y, drop, tone, scale, delay }: { x: number; y: number; drop: number; tone: Tone; scale: number; delay: string }) {
  const top = drop + 6;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="se-ld__lantern" style={{ animationDelay: delay } as CSSProperties}>
        <circle className="se-ld__halo" cx="0" cy={top + 26} r="74" fill={`url(#se-ld-halo-${tone})`} style={{ animationDelay: delay } as CSSProperties} />
        <path d={`M0 0 V${drop}`} stroke="#1a0f1f" strokeWidth="2" />
        <rect x="-11" y={drop} width="22" height="7" rx="1.5" fill="#2a1424" />
        <ellipse cx="0" cy={top + 26} rx="31" ry="27" fill={`url(#se-ld-body-${tone})`} />
        <g fill="none" stroke="#3a1020" strokeOpacity=".45" strokeWidth="1.6">
          <ellipse cx="0" cy={top + 26} rx="19" ry="27" />
          <ellipse cx="0" cy={top + 26} rx="7" ry="27" />
          <path d={`M-29 ${top + 17} H29 M-29 ${top + 35} H29`} strokeOpacity=".25" />
        </g>
        <rect x="-11" y={top + 50} width="22" height="7" rx="1.5" fill="#2a1424" />
        <path className="se-ld__tassel" d={`M0 ${top + 57} V${top + 64} M-4 ${top + 66} L-5 ${top + 88} M0 ${top + 66} V${top + 92} M4 ${top + 66} L5 ${top + 88}`} stroke="#f43f9c" strokeOpacity=".75" strokeWidth="2" />
        <circle cx="0" cy={top + 65} r="3" fill="#ffb84d" />
      </g>
    </g>
  );
}

function StrandCluster({ className, strands }: { className: string; strands: readonly Strand[] }) {
  return (
    <svg className={className} viewBox="0 0 420 420">
      {/* Upturned eave in the corner, where the strands are tied off. */}
      <path d="M-20 -10 H190 Q 172 30 214 52 Q 150 58 96 44 L-20 58 Z" fill="#140a1c" stroke="#f43f9c" strokeOpacity=".4" strokeWidth="2" />
      <path d="M-20 58 L96 44 Q150 58 214 52" fill="none" stroke="#22d3ee" strokeOpacity=".35" strokeWidth="1.5" />
      {strands.map((strand, strandIndex) => (
        <g key={strandIndex} className={strand.back ? 'se-ld__strand se-ld__strand--back' : 'se-ld__strand'}>
          <path
            d={`M${strand.from[0]} ${strand.from[1]} Q ${strand.sag[0]} ${strand.sag[1]} ${strand.to[0]} ${strand.to[1]}`}
            fill="none"
            stroke="#2a1424"
            strokeWidth="2.2"
          />
          {strand.lanterns.map(([t, drop, tone], index) => {
            const [x, y] = pointOn(strand.from, strand.sag, strand.to, t);
            return <Lantern key={index} x={x} y={y} drop={drop} tone={tone} scale={strand.back ? 0.62 : 1} delay={`${-(index * 1.7 + strandIndex * 0.9)}s`} />;
          })}
        </g>
      ))}
    </svg>
  );
}

// Night-market backdrop for the Lantern District shell (`neon-vice`): paper lanterns swaying
// on strands under the eaves, a flickering neon stall sign, and sparks drifting up.
export default function LanternDistrictScene() {
  return (
    <div className="se-theme-scene se-theme-scene--lantern-district">
      <svg className="se-ld__defs" width="0" height="0">
        <defs>
          {(['red', 'amber'] as const).map((tone) => (
            <radialGradient key={`body-${tone}`} id={`se-ld-body-${tone}`} cx=".42" cy=".4" r=".7">
              <stop offset="0" stopColor={tone === 'red' ? '#ffd0a0' : '#fff0c2'} />
              <stop offset=".45" stopColor={tone === 'red' ? '#ff4f6d' : '#ffae3b'} />
              <stop offset="1" stopColor={tone === 'red' ? '#8a1236' : '#a8501a'} />
            </radialGradient>
          ))}
          {(['red', 'amber'] as const).map((tone) => (
            <radialGradient key={`halo-${tone}`} id={`se-ld-halo-${tone}`}>
              <stop offset="0" stopColor={tone === 'red' ? '#ff5a86' : '#ffb84d'} stopOpacity=".55" />
              <stop offset="1" stopColor={tone === 'red' ? '#ff5a86' : '#ffb84d'} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
      </svg>
      <StrandCluster className="se-ld__strands se-ld__strands--left" strands={leftStrands} />
      <StrandCluster className="se-ld__strands se-ld__strands--right" strands={rightStrands} />

      <svg className="se-ld__sign" viewBox="0 0 120 420">
        <rect x="8" y="8" width="104" height="404" rx="8" fill="#0d0716" fillOpacity=".85" />
        <g className="se-ld__neon" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="16" y="16" width="88" height="388" rx="6" stroke="#22d3ee" strokeWidth="3" />
          {/* Abstract stall-name glyphs rather than real characters. */}
          <g stroke="#ff64ac" strokeWidth="5">
            <path d="M38 62 H82 M60 48 V112 M40 86 L60 70 L80 86 M42 108 H78" />
            <path d="M40 152 H80 V196 H40 Z M60 152 V218 M36 218 H84" />
            <path d="M44 254 L76 254 L50 290 H82 M62 272 V330 M42 312 L60 300 L80 314" />
          </g>
          <circle cx="60" cy="370" r="10" stroke="#22d3ee" strokeWidth="3" />
        </g>
      </svg>

      <div className="se-ld__sparks">
        {sparks.map(([left, delay, duration], index) => (
          <i key={index} style={{ left, animationDelay: delay, animationDuration: duration } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
