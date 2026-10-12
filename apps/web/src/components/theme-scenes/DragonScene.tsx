import type { CSSProperties } from 'react';

type Variant = 'ice' | 'fire';

// A dragon in flight, facing left; the shell flies it across the sky every so often.
function Dragon({ variant }: { variant: Variant }) {
  return (
    <g className="se-dg__flight">
      <g className="se-dg__bob">
        <g transform="scale(.6)">
          {variant === 'fire' ? (
            <path
              className="se-dg__breath"
              d="M12 90 C-30 72 -84 62 -150 74 C-96 86 -70 98 -112 116 C-66 110 -32 104 12 96 Z"
              fill="url(#se-dg-breath)"
            />
          ) : null}
          <path className="se-dg__wing se-dg__wing--far" d="M150 92 C146 66 140 44 132 26 L190 30 Q186 44 222 50 Q206 62 220 80 Q196 80 186 92 Z" />
          <path
            className="se-dg__body"
            d="M10 92 L28 84 L46 80 L60 72 L96 48 L76 72 L104 62 L82 82 C100 86 116 86 136 90 C150 92 166 94 184 96 C214 98 238 98 262 96 C300 92 336 84 368 72 L382 58 L384 74 L398 76 L384 82 C352 96 312 108 262 112 C240 122 214 128 190 124 C170 120 150 112 132 106 C114 100 98 98 82 100 C64 102 48 104 30 102 L14 98 Z M150 110 L156 128 L150 134 L162 132 L164 124 L160 108 Z M196 122 L204 140 L196 148 L210 146 L214 138 L210 122 Z M240 116 L256 134 L250 144 L264 140 L264 130 L254 112 Z M100 87 L107 77 L113 88 Z M124 90 L131 80 L137 91 Z M214 98 L221 88 L227 98 Z M244 97 L251 87 L257 97 Z M290 92 L296 83 L302 90 Z"
          />
          <g className="se-dg__wing se-dg__wing--near">
            <path d="M158 94 C148 60 130 32 108 10 L112 0 L120 9 Q160 -2 204 6 Q198 24 252 28 Q236 46 270 64 Q240 72 248 94 Q220 88 206 100 Z" />
            <path className="se-dg__bones" d="M118 10 L204 6 M118 10 L252 28 M118 10 L270 64 M118 10 L248 94" />
          </g>
          <circle className="se-dg__eye" cx="40" cy="86" r="2.8" />
        </g>
      </g>
    </g>
  );
}

function SkyBand({ variant }: { variant: Variant }) {
  return (
    <svg className="se-dg__sky" viewBox="0 0 1600 440">
      <defs>
        <linearGradient id="se-dg-aurora" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5ef0d0" stopOpacity="0" />
          <stop offset=".3" stopColor="#5ef0d0" stopOpacity=".38" />
          <stop offset=".65" stopColor="#8a7dff" stopOpacity=".32" />
          <stop offset="1" stopColor="#8a7dff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="se-dg-smoke">
          <stop offset="0" stopColor="#4a1a12" stopOpacity=".7" />
          <stop offset="1" stopColor="#4a1a12" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="se-dg-breath" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#fff1b0" />
          <stop offset=".35" stopColor="#ff9a3a" stopOpacity=".9" />
          <stop offset="1" stopColor="#ff4a1f" stopOpacity="0" />
        </linearGradient>
      </defs>

      {variant === 'ice' ? (
        <g className="se-dg__aurora">
          <path d="M-200 110 C200 30 500 170 800 92 S1400 30 1800 110 L1800 146 C1400 74 1100 206 800 136 S200 84 -200 156 Z" fill="url(#se-dg-aurora)" />
          <path d="M-200 170 C260 110 560 220 860 160 S1420 120 1800 190 L1800 206 C1420 150 1120 246 860 192 S240 150 -200 200 Z" fill="url(#se-dg-aurora)" opacity=".6" />
        </g>
      ) : null}

      <Dragon variant={variant} />

      {variant === 'fire' ? (
        <g className="se-dg__smoke">
          <ellipse cx="260" cy="60" rx="420" ry="90" fill="url(#se-dg-smoke)" />
          <ellipse cx="1000" cy="30" rx="520" ry="80" fill="url(#se-dg-smoke)" />
          <ellipse cx="1500" cy="90" rx="380" ry="100" fill="url(#se-dg-smoke)" />
        </g>
      ) : (
        <g className="se-dg__gusts" stroke="#dff6ff" strokeLinecap="round">
          {[[180, 240, '0s'], [620, 300, '-2.4s'], [1080, 210, '-4.1s'], [1380, 330, '-6.3s']].map(([x, y, delay], index) => (
            <path key={index} d={`M${x} ${y} q 160 -24 340 -6`} strokeWidth="1.4" fill="none" style={{ animationDelay: delay } as CSSProperties} />
          ))}
        </g>
      )}
    </svg>
  );
}

// Icicles hanging from a frosted ledge: [x, length, width]. A glint runs down some, others drip.
const icicles = [
  [14, 92, 14], [38, 150, 18], [66, 70, 12], [92, 122, 16], [120, 54, 10],
  [148, 102, 14], [178, 42, 10], [206, 78, 12], [236, 34, 8],
] as const;

function IcicleFringe({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`se-dg__corner se-dg__corner--top se-dg__corner--${side}`} viewBox="0 0 320 220">
      <defs>
        <linearGradient id={`se-dg-icicle-${side}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#effcff" stopOpacity=".85" />
          <stop offset="1" stopColor="#8de0ff" stopOpacity=".12" />
        </linearGradient>
      </defs>
      {icicles.map(([x, length, width], index) => {
        const y = 22 - x / 18;
        return (
          <g key={index}>
            <path
              d={`M${x - width / 2} ${y} Q${x - width / 4} ${y + length * 0.6} ${x} ${y + length} Q${x + width / 4} ${y + length * 0.6} ${x + width / 2} ${y} Z`}
              fill={`url(#se-dg-icicle-${side})`}
              stroke="#e9fbff"
              strokeOpacity=".35"
            />
            {index % 3 === 1 ? (
              <rect className="se-dg__glint" x={x - 2.5} y={y} width="3" height="18" rx="1.5" fill="#fff" style={{ animationDelay: `${-index * 1.3}s` } as CSSProperties} />
            ) : null}
            {index % 3 === 0 ? (
              <circle className="se-dg__drip" cx={x} cy={y + length + 3} r="2.4" fill="#d8f7ff" style={{ animationDelay: `${-index * 0.9}s` } as CSSProperties} />
            ) : null}
          </g>
        );
      })}
      <path d="M-20 -10 H320 V2 Q290 18 240 12 Q200 24 150 16 Q96 28 44 20 L-20 28 Z" fill="#dff6ff" fillOpacity=".5" />
      <path d="M-20 28 L44 20 Q96 28 150 16 Q200 24 240 12 Q290 18 320 2" fill="none" stroke="#8de0ff" strokeOpacity=".6" strokeWidth="1.5" />
    </svg>
  );
}

// Ice crystal spires rising from the floor: [x, width, height, tilt].
const crystals = [
  [34, 30, 120, -26], [204, 30, 110, 18], [252, 22, 70, 26], [62, 46, 210, -14], [162, 38, 170, 8], [112, 60, 280, -4],
] as const;

function CrystalSpires({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`se-dg__corner se-dg__corner--bottom se-dg__corner--${side}`} viewBox="0 0 320 320">
      <ellipse cx="130" cy="330" rx="220" ry="90" fill="#8de0ff" fillOpacity=".12" />
      {crystals.map(([x, width, height, tilt], index) => {
        const top = 320 - height;
        const shoulder = top + width * 0.8;
        return (
          <g key={index} transform={`rotate(${tilt} ${x} 320)`}>
            <path className="se-dg__facet" d={`M${x} ${top} L${x - width / 2} ${shoulder} V330 H${x} Z`} fill="#bfefff" fillOpacity=".42" style={{ animationDelay: `${-index * 1.1}s` } as CSSProperties} />
            <path d={`M${x} ${top} V330 H${x + width / 2} V${shoulder} Z`} fill="#4c8fbf" fillOpacity=".38" />
            <path d={`M${x - width / 2} ${shoulder} L${x} ${top} L${x + width / 2} ${shoulder}`} fill="none" stroke="#effcff" strokeOpacity=".55" strokeWidth="1.5" />
          </g>
        );
      })}
    </svg>
  );
}

// Lava-cracked rocks with flames licking up from the peaks: flames are [x, y, scale].
const flames = [[110, 62, 1.25], [30, 92, 0.8], [200, 92, 0.95], [262, 146, 0.65]] as const;

function LavaCrags({ side }: { side: 'left' | 'right' }) {
  return (
    <svg className={`se-dg__corner se-dg__corner--bottom se-dg__corner--${side}`} viewBox="0 0 360 260">
      <defs>
        <linearGradient id={`se-dg-flame-${side}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset=".45" stopColor="#ff6a24" stopOpacity=".85" />
          <stop offset="1" stopColor="#c8261a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`se-dg-rock-${side}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a1d12" />
          <stop offset=".5" stopColor="#24100a" />
          <stop offset="1" stopColor="#0e0504" />
        </linearGradient>
        <radialGradient id={`se-dg-lava-${side}`} cy="1">
          <stop offset="0" stopColor="#ff5a1f" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse className="se-dg__lava-glow" cx="140" cy="260" rx="240" ry="150" fill={`url(#se-dg-lava-${side})`} />
      {flames.map(([x, y, scale], index) => (
        <g key={index} transform={`translate(${x} ${y + 6}) scale(${scale})`}>
          <path
            className="se-dg__flame"
            d="M-20 0 C-26 -30 -8 -44 -6 -78 C4 -54 16 -48 12 -22 C20 -34 24 -12 20 0 Z"
            fill={`url(#se-dg-flame-${side})`}
            style={{ animationDelay: `${-index * 0.7}s` } as CSSProperties}
          />
          <path
            className="se-dg__flame se-dg__flame--core"
            d="M-9 0 C-12 -16 -3 -24 -2 -40 C4 -28 10 -22 8 0 Z"
            fill="#fff1b0"
            fillOpacity=".8"
            style={{ animationDelay: `${-index * 0.5}s` } as CSSProperties}
          />
        </g>
      ))}
      <path d="M-20 120 L30 92 L70 112 L110 62 L160 102 L200 92 L240 140 L262 146 L300 172 L360 204 L380 214 L380 270 H-20 Z" fill={`url(#se-dg-rock-${side})`} />
      <path d="M-20 120 L30 92 L70 112 L110 62 L160 102 L200 92 L240 140 L262 146 L300 172 L360 204 L380 214" fill="none" stroke="#ff7a3a" strokeOpacity=".5" strokeWidth="2" strokeLinejoin="round" />
      <g className="se-dg__cracks" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M110 70 L116 92 L108 112 L120 136 L112 162 L122 200 L116 262 M108 112 L88 124 L80 146 L84 170 M120 136 L142 148 L150 172 M200 96 L206 120 L196 142 L210 170 L204 210 L212 262 M196 142 L176 156 L170 180 M30 98 L36 126 L26 150 L34 190 L28 262" stroke="#ff6a2a" strokeOpacity=".3" strokeWidth="7" />
        <path d="M110 70 L116 92 L108 112 L120 136 L112 162 L122 200 L116 262 M108 112 L88 124 L80 146 L84 170 M120 136 L142 148 L150 172 M200 96 L206 120 L196 142 L210 170 L204 210 L212 262 M196 142 L176 156 L170 180 M30 98 L36 126 L26 150 L34 190 L28 262" stroke="#ffb35a" strokeWidth="1.8" />
      </g>
    </svg>
  );
}

// Dragon shell backdrops: the Ice Dragon sky carries an aurora, icicles and crystal spires;
// the Fire Dragon sky carries smoke, lava-cracked crags and flames. A dragon flies over both.
export default function DragonScene({ variant }: { variant: Variant }) {
  return (
    <div className={`se-theme-scene se-theme-scene--dragon-${variant}`}>
      <SkyBand variant={variant} />
      {variant === 'ice' ? (
        <>
          <IcicleFringe side="left" />
          <IcicleFringe side="right" />
          <CrystalSpires side="left" />
          <CrystalSpires side="right" />
        </>
      ) : (
        <>
          <LavaCrags side="left" />
          <LavaCrags side="right" />
        </>
      )}
    </div>
  );
}
