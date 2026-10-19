// A party for the Birthday Bash shell (`birthday-shell`, worn on a player's birthday only): bunting
// strung across the top corner, balloons drifting in the bottom corner and slow confetti.
const balloons = [
  // [x, y, colour, delay]
  [90, 150, '#ff6fb5', '0s'], [160, 110, '#ffd166', '-2s'], [230, 160, '#5ad1ff', '-4s'], [300, 120, '#7ef29d', '-6s'],
] as const;

const flags = ['#ff6fb5', '#ffd166', '#5ad1ff', '#7ef29d', '#c48bff'];

export default function BirthdayScene() {
  return (
    <div className="se-theme-scene se-theme-scene--birthday">
      <div className="se-bd__confetti" />
      <svg className="se-bd__bunting" viewBox="0 0 760 120">
        <path d="M0 20 Q380 110 760 20" stroke="#fff4fb" strokeOpacity=".35" strokeWidth="2" fill="none" />
        {Array.from({ length: 15 }, (_, index) => {
          const t = (index + 0.5) / 15;
          const x = t * 760;
          const y = 20 + 4 * 45 * t * (1 - t);
          return <path key={index} d={`M${x - 16} ${y} L${x + 16} ${y + 2} L${x} ${y + 34} Z`} fill={flags[index % flags.length]} fillOpacity=".55" />;
        })}
      </svg>
      <svg className="se-bd__balloons" viewBox="0 0 380 380" preserveAspectRatio="xMaxYMax meet">
        {balloons.map(([x, y, color, delay]) => (
          <g key={x} className="se-bd__balloon" style={{ animationDelay: delay }}>
            <path d={`M${x} ${y + 52} Q${x - 10} ${y + 120} ${x + 6} ${y + 200} T${x} 380`} stroke="#fff4fb" strokeOpacity=".35" strokeWidth="1.4" fill="none" />
            <ellipse cx={x} cy={y} rx="38" ry="48" fill={color} fillOpacity=".55" stroke={color} strokeOpacity=".8" />
            <path d={`M${x - 6} ${y + 47} L${x + 6} ${y + 47} L${x} ${y + 55} Z`} fill={color} fillOpacity=".7" />
            <ellipse cx={x - 13} cy={y - 18} rx="8" ry="13" fill="#ffffff" fillOpacity=".35" />
          </g>
        ))}
      </svg>
    </div>
  );
}
