// Roller-disco night for the Platinum Funk shell (`platinum-funk-shell`, The Drop): a mirror ball
// turning in the top corner, light flecks drifting over the page and sunburst stripes on the
// rink wall at the bottom.
export default function PlatinumFunkScene() {
  return (
    <div className="se-theme-scene se-theme-scene--platinum-funk">
      <svg className="se-pf__ball" viewBox="0 0 220 260">
        <defs>
          <radialGradient id="se-pf-ball" cx=".38" cy=".34" r=".7">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".5" stopColor="#b9bec8" />
            <stop offset="1" stopColor="#4a4e56" />
          </radialGradient>
          <clipPath id="se-pf-clip"><circle cx="120" cy="140" r="70" /></clipPath>
        </defs>
        <path d="M120 0 V70" stroke="#d9dee6" strokeOpacity=".5" strokeWidth="2" />
        <circle cx="120" cy="140" r="70" fill="url(#se-pf-ball)" opacity=".75" />
        <g clipPath="url(#se-pf-clip)" stroke="#1e130b" strokeOpacity=".5" strokeWidth="1.2" fill="none">
          <g className="se-pf__tiles">
            {Array.from({ length: 14 }, (_, index) => <path key={index} d={`M${20 + index * 14} 60 V220`} />)}
          </g>
          {Array.from({ length: 10 }, (_, index) => <path key={index} d={`M40 ${74 + index * 14} H200`} />)}
        </g>
      </svg>
      <div className="se-pf__flecks" />
      <svg className="se-pf__stripes" viewBox="0 0 560 220" preserveAspectRatio="xMaxYMax meet">
        {['#ff8a2a', '#c9651a', '#7a3e14', '#4a2a17'].map((color, index) => (
          <path key={color} d={`M${560 - (220 - index * 40)} 220 A${220 - index * 40} ${220 - index * 40} 0 0 1 560 ${index * 40}`} fill="none" stroke={color} strokeOpacity=".55" strokeWidth="22" />
        ))}
      </svg>
    </div>
  );
}
