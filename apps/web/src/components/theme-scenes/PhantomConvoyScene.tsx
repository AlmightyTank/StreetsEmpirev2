import type { CSSProperties } from 'react';

// A fixed-seed skyline so every visit draws the same city: [x, width, height] per building,
// plus [x, y, lit-delay] per window that glows (null delay = steady).
function buildSkyline() {
  let seed = 7;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const buildings: [number, number, number][] = [];
  const windows: [number, number, string | null][] = [];
  for (let x = -10; x < 1610; ) {
    const width = 34 + Math.round(next() * 52);
    const height = 36 + Math.round(next() * (next() > 0.8 ? 120 : 64));
    buildings.push([x, width, height]);
    for (let row = 0; row < Math.floor(height / 14) - 1; row += 1) {
      for (let col = 0; col < Math.floor(width / 12); col += 1) {
        if (next() > 0.84) windows.push([x + 5 + col * 12, 204 - height + 8 + row * 14, next() > 0.7 ? `${-(next() * 9).toFixed(1)}s` : null]);
      }
    }
    x += width + Math.round(next() * 6);
  }
  return { buildings, windows };
}

const skyline = buildSkyline();

// One rig facing left: cab, trailer, marker lights, headlight beam and its streak on the wet road.
function Rig({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M2 30 L-220 8 L-220 50 L2 36 Z" fill="url(#se-pc-beam)" />
      <rect x="-4" y="52" width="12" height="70" fill="url(#se-pc-streak)" />
      <rect x="222" y="52" width="6" height="40" fill="url(#se-pc-tail-streak)" />
      <g className="se-pc__rig">
        <rect x="56" y="-14" width="172" height="54" rx="2" />
        <path d="M0 30 L6 12 L20 4 L52 4 L52 40 L0 40 Z" />
        <path d="M10 14 L22 8 L40 8 L40 20 L8 20 Z" className="se-pc__glass" />
        {[14, 44, 160, 186, 212].map((wheelX) => <circle key={wheelX} cx={wheelX} cy="42" r="7" className="se-pc__wheel" />)}
      </g>
      <g fill="#ffb238">
        {[64, 110, 156, 202, 222].map((lightX) => <circle key={lightX} cx={lightX} cy="-12" r="1.8" />)}
        {[26, 34, 42].map((lightX) => <circle key={lightX} cx={lightX} cy="2" r="1.6" />)}
      </g>
      <circle cx="3" cy="32" r="3.2" fill="#fff3b0" />
      <rect x="225" y="30" width="3" height="7" fill="#ff3b3b" />
    </g>
  );
}

// Night-highway backdrop for the Phantom Convoy shell (`open-road`): a ghost convoy crossing a
// wet highway under the city glow, an overhead route sign, a sodium streetlight and headlight sweeps.
export default function PhantomConvoyScene() {
  return (
    <div className="se-theme-scene se-theme-scene--phantom-convoy">
      <div className="se-pc__sweep" />

      <svg className="se-pc__streetlight" viewBox="0 0 300 380">
        <defs>
          <linearGradient id="se-pc-cone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd27a" stopOpacity=".34" />
            <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="se-pc__cone" d="M184 50 L216 50 L330 380 L70 380 Z" fill="url(#se-pc-cone)" />
        <path d="M-10 28 H150 Q196 28 200 40" fill="none" stroke="#1d2735" strokeWidth="7" strokeLinecap="round" />
        <path d="M176 40 H224 L214 52 H186 Z" fill="#26323f" />
        <ellipse className="se-pc__lamp" cx="200" cy="52" rx="13" ry="3.4" fill="#ffe2a0" />
      </svg>

      <svg className="se-pc__sign" viewBox="0 0 360 200">
        <defs>
          <clipPath id="se-pc-sign-face">
            <rect x="150" y="56" width="196" height="96" rx="8" />
          </clipPath>
          <linearGradient id="se-pc-glint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="#2a3644" strokeWidth="4" fill="none">
          <path d="M120 14 H380 M120 36 H380" />
          <path d="M120 14 L142 36 L164 14 L186 36 L208 14 L230 36 L252 14 L274 36 L296 14 L318 36 L340 14 L362 36" strokeWidth="2.5" />
          <path d="M190 36 V56 M310 36 V56" />
        </g>
        <rect x="150" y="56" width="196" height="96" rx="8" fill="#0f5a3a" fillOpacity=".78" stroke="#e8f5e9" strokeOpacity=".75" strokeWidth="3" />
        <rect x="282" y="40" width="64" height="20" rx="3" fill="#facc15" fillOpacity=".85" />
        <text x="314" y="55" textAnchor="middle" className="se-pc__sign-type se-pc__sign-type--tab">EXIT 13</text>
        <text x="172" y="100" className="se-pc__sign-type">Night Rd</text>
        <text x="172" y="132" className="se-pc__sign-type se-pc__sign-type--small">Convoy Route</text>
        <path d="M312 128 L332 108 M318 108 H332 V122" stroke="#e8f5e9" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <g clipPath="url(#se-pc-sign-face)">
          <rect className="se-pc__glint" x="100" y="40" width="60" height="130" fill="url(#se-pc-glint)" transform="skewX(-20)" />
        </g>
      </svg>

      <svg className="se-pc__horizon" viewBox="0 0 1600 300">
        <defs>
          <radialGradient id="se-pc-glow" cy="1">
            <stop offset="0" stopColor="#facc15" stopOpacity=".4" />
            <stop offset="1" stopColor="#facc15" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="se-pc-glow-blue" cy="1">
            <stop offset="0" stopColor="#38bdf8" stopOpacity=".34" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="se-pc-beam" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#fff3b0" stopOpacity=".55" />
            <stop offset="1" stopColor="#fff3b0" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="se-pc-streak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3b0" stopOpacity=".6" />
            <stop offset="1" stopColor="#facc15" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="se-pc-tail-streak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff3b3b" stopOpacity=".55" />
            <stop offset="1" stopColor="#ff3b3b" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="se-pc-wet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a2533" />
            <stop offset="1" stopColor="#06090e" />
          </linearGradient>
        </defs>

        <ellipse cx="420" cy="210" rx="460" ry="150" fill="url(#se-pc-glow)" />
        <ellipse cx="1180" cy="210" rx="520" ry="160" fill="url(#se-pc-glow-blue)" />

        <g fill="#16212f">
          {skyline.buildings.map(([x, width, height], index) => <rect key={index} x={x} y={204 - height} width={width} height={height} />)}
        </g>
        <g fill="#ffd77a">
          {skyline.windows.map(([x, y, delay], index) => (
            <rect
              key={index}
              x={x}
              y={y}
              width="4"
              height="5"
              className={delay ? 'se-pc__window' : undefined}
              fillOpacity=".7"
              style={delay ? ({ animationDelay: delay } as CSSProperties) : undefined}
            />
          ))}
        </g>

        <rect x="0" y="204" width="1600" height="96" fill="url(#se-pc-wet)" />
        <path d="M0 214 H1600" stroke="#facc15" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="26 22" />
        <g className="se-pc__reflections" fill="#ffd77a">
          {skyline.windows.filter((_, index) => index % 9 === 0).map(([x, , delay], index) => (
            <rect key={index} x={x} y="226" width="3" height="40" fillOpacity=".18" style={delay ? ({ animationDelay: delay } as CSSProperties) : undefined} />
          ))}
        </g>

        <g className="se-pc__convoy">
          <g transform="translate(0 168)">
            <Rig x={0} />
            <Rig x={300} />
            <Rig x={600} />
          </g>
        </g>
        <path d="M0 252 H1600" stroke="#38bdf8" strokeOpacity=".12" strokeWidth="1" />
      </svg>
    </div>
  );
}
