// Night at the drag strip for the Quarter Mile shell (`quarter-mile-shell`, The Drop): a start
// tree counting down through its ambers to green, the finish gantry far off and light trails
// streaking down the strip.
const ambers = [0, 1, 2] as const;
const trails = [['62%', '-0.4s', '#2f9bff'], ['72%', '-1.6s', '#ff7a1a'], ['82%', '-2.4s', '#2f9bff']] as const;

export default function QuarterMileScene() {
  return (
    <div className="se-theme-scene se-theme-scene--quarter-mile">
      <svg className="se-qm__tree" viewBox="0 0 120 320" preserveAspectRatio="xMaxYMin meet">
        {/* The start tree: a pole, staging bulbs, three ambers that light in turn, then green. */}
        <rect x="56" y="0" width="8" height="320" fill="#0c111a" />
        <rect x="30" y="40" width="60" height="230" rx="10" fill="#111827" stroke="#2f9bff" strokeOpacity=".35" />
        <g fill="#f4f7fb" opacity=".55">
          <circle cx="48" cy="62" r="6" /><circle cx="72" cy="62" r="6" />
        </g>
        {ambers.map((index) => (
          <g key={index} className="se-qm__amber" style={{ animationDelay: `${index * 0.6}s` }}>
            <circle cx="48" cy={104 + index * 40} r="12" fill="#ffb12a" />
            <circle cx="72" cy={104 + index * 40} r="12" fill="#ffb12a" />
          </g>
        ))}
        <g className="se-qm__green">
          <circle cx="48" cy="226" r="12" fill="#3dff8a" />
          <circle cx="72" cy="226" r="12" fill="#3dff8a" />
        </g>
      </svg>
      <svg className="se-qm__strip" viewBox="0 0 560 300" preserveAspectRatio="xMaxYMax meet">
        {/* Two lanes running to a vanishing point, the finish gantry and grandstand lights. */}
        <path d="M120 300 L370 120 L410 120 L560 300 Z" fill="#0b0f16" />
        <path d="M340 300 L390 120" stroke="#f4f7fb" strokeOpacity=".22" strokeWidth="3" strokeDasharray="14 12" />
        <path d="M120 300 L370 120 M560 300 L410 120" stroke="#2f9bff" strokeOpacity=".3" strokeWidth="2" />
        <g stroke="#0c111a" strokeWidth="4">
          <path d="M364 120 V84 M416 120 V84 M364 86 H416" />
        </g>
        <path d="M368 92 H412 V102 H368 Z" fill="#f4f7fb" opacity=".8" />
        <path d="M368 92 h6 v5 h-6 Z M380 92 h6 v5 h-6 Z M392 92 h6 v5 h-6 Z M404 92 h6 v5 h-6 Z M374 97 h6 v5 h-6 Z M386 97 h6 v5 h-6 Z M398 97 h6 v5 h-6 Z" fill="#0c111a" />
        <g fill="#ffe7a8" opacity=".5">
          <circle cx="250" cy="120" r="3" /><circle cx="290" cy="112" r="3" /><circle cx="470" cy="112" r="3" /><circle cx="520" cy="120" r="3" />
        </g>
      </svg>
      <div className="se-qm__trails">
        {trails.map(([top, delay, color], index) => (
          <i key={index} style={{ top, animationDelay: delay, background: `linear-gradient(90deg, transparent, ${color})` }} />
        ))}
      </div>
    </div>
  );
}
