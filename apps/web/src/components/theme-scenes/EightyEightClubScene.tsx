// A stormy town square for the 88 Club shell (`88-club-shell`, The Drop): the courthouse clock
// stopped at 10:04, lightning crawling down the tower and twin fire trails burning off the road.
export default function EightyEightClubScene() {
  return (
    <div className="se-theme-scene se-theme-scene--88-club">
      <svg className="se-ec__tower" viewBox="0 0 360 340" preserveAspectRatio="xMaxYMax meet">
        {/* The tower: a stepped roof, a clock face stuck at 10:04 and a slow-glowing bolt above it. */}
        <path className="se-ec__bolt" d="M196 0 L176 46 L194 46 L172 98" stroke="#bfefff" strokeWidth="4" fill="none" strokeLinejoin="round" />
        <path d="M120 340 V150 L180 104 L240 150 V340 Z" fill="#101624" />
        <path d="M60 340 V230 H300 V340 Z" fill="#0c111c" />
        <g fill="#0c111c" stroke="#4fd2ff" strokeOpacity=".2">
          <rect x="80" y="252" width="22" height="40" /><rect x="128" y="252" width="22" height="40" />
          <rect x="210" y="252" width="22" height="40" /><rect x="258" y="252" width="22" height="40" />
        </g>
        <circle cx="180" cy="178" r="36" fill="#e9f3f6" opacity=".9" stroke="#4fd2ff" strokeWidth="4" />
        <g stroke="#0c111c" strokeLinecap="round">
          {/* 10:04: the hour hand just past ten, the minute hand on four minutes. */}
          <path d="M180 178 L159 166" strokeWidth="5" />
          <path d="M180 178 L188 148" strokeWidth="3" />
        </g>
        <circle cx="180" cy="178" r="3" fill="#0c111c" />
      </svg>
      <svg className="se-ec__road" viewBox="0 0 560 120" preserveAspectRatio="xMaxYMax meet">
        <rect x="0" y="80" width="560" height="40" fill="#0a0e17" />
        <g className="se-ec__fire" fill="none" strokeLinecap="round" strokeWidth="5">
          <path d="M120 96 H520" stroke="#ff8a2a" />
          <path d="M120 110 H520" stroke="#ffcf4a" />
        </g>
      </svg>
      <div className="se-ec__storm" />
    </div>
  );
}
