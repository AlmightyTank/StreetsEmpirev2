// Golden hour for the Biscayne Sunset shell (`biscayne-sunset-shell`, The Drop): a striped sun
// sinking into the water, deco hotel fronts trimmed in flamingo and sea-glass light, and palms
// that sway slowly in the breeze.
const hotels = [
  // [x, width, height]
  [150, 78, 170], [224, 64, 210], [284, 96, 150], [376, 72, 196], [444, 76, 160],
] as const;

const palms = [[118, 300, 1.1, '-1s'], [470, 296, 0.9, '-3s'], [520, 310, 1.2, '-5s']] as const;

export default function BiscayneSunsetScene() {
  return (
    <div className="se-theme-scene se-theme-scene--biscayne-sunset">
      <svg className="se-bs__bay" viewBox="0 0 560 340" preserveAspectRatio="xMaxYMax meet">
        <defs>
          <linearGradient id="se-bs-sun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd27a" />
            <stop offset=".6" stopColor="#ff8fb1" />
            <stop offset="1" stopColor="#c95680" />
          </linearGradient>
        </defs>
        <circle cx="330" cy="250" r="96" fill="url(#se-bs-sun)" opacity=".5" />
        <g stroke="#140c16" strokeWidth="6" opacity=".55">
          <path d="M230 214 H430 M230 232 H430" />
        </g>
        {hotels.map(([x, w, h], index) => {
          const top = 260 - h;
          return (
            <g key={index}>
              <path d={`M${x} 260 V${top + 16} Q${x} ${top} ${x + 16} ${top} H${x + w - 16} Q${x + w} ${top} ${x + w} ${top + 16} V260 Z`} fill="#1f1422" stroke="#ff8fb1" strokeOpacity=".45" strokeWidth="1.4" />
              <path d={`M${x + 8} ${top + 26} H${x + w - 8}`} stroke="#4fd6c7" strokeOpacity=".55" strokeWidth="2" />
              {Array.from({ length: Math.floor(h / 30) }, (_, row) => (
                <path key={row} d={`M${x + 12} ${top + 44 + row * 26} H${x + w - 12}`} stroke="#ffd27a" strokeOpacity={(row + index) % 2 ? 0.14 : 0.32} strokeWidth="5" strokeDasharray="8 6" />
              ))}
            </g>
          );
        })}
        <rect x="0" y="260" width="560" height="80" fill="#140c16" />
        <g stroke="#ff8fb1" strokeOpacity=".3" strokeWidth="2">
          <path d="M270 276 H390 M290 292 H370 M306 308 H354 M318 322 H342" />
        </g>
        {palms.map(([x, base, scale, delay], index) => (
          <g key={index} transform={`translate(${x} ${base}) scale(${scale})`}>
            <path d="M0 0 Q6 -60 -4 -120" stroke="#0e0a10" strokeWidth="7" fill="none" strokeLinecap="round" />
            <g className="se-bs__fronds" style={{ animationDelay: delay }}>
              <path d="M-4 -120 Q-40 -132 -66 -104 M-4 -120 Q-30 -150 -58 -146 M-4 -120 Q20 -150 46 -140 M-4 -120 Q34 -128 56 -100 M-4 -120 Q-6 -150 6 -164" stroke="#0e0a10" strokeWidth="5" fill="none" strokeLinecap="round" />
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
