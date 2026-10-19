// A summer afternoon for the Block Party shell (`block-party-shell`, a held holiday set): brownstone stoops,
// string flags across the street and an open hydrant spraying.
const flags = ['#ffb627', '#5ab4ff', '#e8443a', '#7ef29d', '#ff6fb5'];
const brownstones = [[200, 120], [300, 100], [400, 130]] as const;

export default function BlockPartyScene() {
  return (
    <div className="se-theme-scene se-theme-scene--block-party">
      <svg className="se-bp__flags" viewBox="0 0 760 100">
        <path d="M0 10 Q380 80 760 10" stroke="#f4f9ff" strokeOpacity=".3" strokeWidth="2" fill="none" />
        {Array.from({ length: 18 }, (_, index) => {
          const t = (index + 0.5) / 18;
          const x = t * 760;
          const y = 10 + 4 * 35 * t * (1 - t);
          return <rect key={index} x={x - 10} y={y} width="20" height="16" fill={flags[index % flags.length]} fillOpacity=".55" />;
        })}
      </svg>
      <svg className="se-bp__block" viewBox="0 0 560 320" preserveAspectRatio="xMaxYMax meet">
        {brownstones.map(([x, top]) => (
          <g key={x}>
            <rect x={x} y={top} width="96" height={320 - top} fill="#3a1f18" fillOpacity=".75" stroke="#162639" />
            {[0, 1, 2].map((row) => <rect key={row} x={x + 14} y={top + 20 + row * 46} width="22" height="30" fill="#ffd166" fillOpacity=".2" />)}
            {[0, 1, 2].map((row) => <rect key={row} x={x + 60} y={top + 20 + row * 46} width="22" height="30" fill="#ffd166" fillOpacity=".14" />)}
            <path d={`M${x + 30} 320 L${x + 30} 290 H${x + 66} V320`} fill="#2a1610" />
          </g>
        ))}
        <g transform="translate(520 300)">
          <rect x="-8" y="-24" width="16" height="24" rx="3" fill="#e8443a" fillOpacity=".8" />
          <path className="se-bp__spray" d="M8 -14 Q40 -50 70 -10 M8 -12 Q44 -30 64 0 M8 -16 Q30 -66 54 -40" stroke="#8ad0ff" strokeOpacity=".6" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        <rect x="0" y="300" width="560" height="20" fill="#08101a" />
      </svg>
    </div>
  );
}
