// A border run for the Desert Mirage shell (`desert-mirage-shell`, The Drop): a white sun high in
// the corner, red mesas on the horizon and a road where heat shimmer rises off the asphalt.
export default function DesertMirageScene() {
  return (
    <div className="se-theme-scene se-theme-scene--desert-mirage">
      <svg className="se-dm__sun" viewBox="0 0 300 300">
        <defs>
          <radialGradient id="se-dm-sun" cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#fffaf0" stopOpacity=".7" />
            <stop offset=".35" stopColor="#ffe9c2" stopOpacity=".35" />
            <stop offset="1" stopColor="#ffe9c2" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="210" cy="90" r="150" fill="url(#se-dm-sun)" />
        <circle cx="210" cy="90" r="34" fill="#fffaf0" fillOpacity=".55" />
      </svg>
      <svg className="se-dm__mesas" viewBox="0 0 560 300" preserveAspectRatio="xMaxYMax meet">
        <path d="M120 230 L150 170 H230 L250 200 H300 L320 150 H420 L450 230 Z" fill="#7a3a1a" fillOpacity=".6" />
        <path d="M300 240 L330 190 H400 L430 240 Z M440 240 L462 200 H530 L556 240 Z" fill="#a8502a" fillOpacity=".55" />
        <path d="M150 170 H230 M320 150 H420 M330 190 H400 M462 200 H530" stroke="#d9733a" strokeOpacity=".7" strokeWidth="2" />
        <path d="M0 240 H560 V300 H0 Z" fill="#1f1610" />
        <path d="M320 240 L250 300 H470 L380 240 Z" fill="#2a1f17" />
        <path d="M350 246 L340 262 M346 270 L334 290" stroke="#e8cfa0" strokeOpacity=".5" strokeWidth="3" />
        <g stroke="#3fc1c9" strokeOpacity=".6" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M520 276 V230 M520 250 Q508 250 508 238 M520 244 Q532 244 532 232" />
        </g>
      </svg>
      <div className="se-dm__shimmer" />
    </div>
  );
}
