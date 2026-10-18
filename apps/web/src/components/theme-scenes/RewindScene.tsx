// A tape from the eighties for the Rewind shell (`rewind-shell`, The Drop): a CRT glowing in the
// corner over a magenta grid floor, with scan lines and a tracking glitch rolling down the page.
export default function RewindScene() {
  return (
    <div className="se-theme-scene se-theme-scene--rewind">
      <svg className="se-rw__crt" viewBox="0 0 300 260">
        <defs>
          <linearGradient id="se-rw-screen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e04bff" stopOpacity=".5" />
            <stop offset="1" stopColor="#c6ff3d" stopOpacity=".25" />
          </linearGradient>
        </defs>
        <rect x="70" y="40" width="210" height="170" rx="22" fill="#191621" stroke="#e04bff" strokeOpacity=".4" strokeWidth="2" />
        <rect x="88" y="58" width="150" height="126" rx="18" fill="url(#se-rw-screen)" />
        <text x="150" y="128" textAnchor="middle" fill="#f6f0ff" fillOpacity=".7" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="22" letterSpacing="3">PLAY</text>
        <path d="M200 112 L216 121 L200 130 Z" fill="#f6f0ff" fillOpacity=".7" />
        <g fill="#c6ff3d" fillOpacity=".5"><circle cx="258" cy="80" r="6" /><circle cx="258" cy="104" r="6" /></g>
        <path d="M120 210 L100 240 M230 210 L250 240" stroke="#e04bff" strokeOpacity=".4" strokeWidth="4" />
      </svg>
      <svg className="se-rw__grid" viewBox="0 0 600 200" preserveAspectRatio="xMaxYMax meet">
        <g stroke="#e04bff" strokeOpacity=".35" strokeWidth="1.4">
          {Array.from({ length: 13 }, (_, index) => <path key={index} d={`M300 0 L${index * 50} 200`} />)}
          {[10, 30, 60, 100, 150, 200].map((y) => <path key={y} d={`M0 ${y} H600`} />)}
        </g>
      </svg>
      <div className="se-rw__scan" />
      <div className="se-rw__glitch" />
    </div>
  );
}
