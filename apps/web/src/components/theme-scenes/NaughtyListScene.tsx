// The stash house at the holidays for the Naughty List shell (`naughty-list-shell`, a held holiday set):
// wrapped boxes stacked by a back door, a sack of coal, and foil glints that catch the light in turn.
const boxes = [
  // [x, y, w, h, paper, ribbon]
  [300, 240, 70, 60, '#e23a3a', '#ffd166'], [376, 252, 54, 48, '#2f8a4f', '#ffffff'], [312, 196, 46, 44, '#2f8a4f', '#e23a3a'],
  [436, 230, 62, 70, '#ffffff', '#e23a3a'], [366, 214, 40, 38, '#ffd166', '#2f8a4f'],
] as const;

export default function NaughtyListScene() {
  return (
    <div className="se-theme-scene se-theme-scene--naughty-list">
      <svg className="se-nl__stash" viewBox="0 0 560 320" preserveAspectRatio="xMaxYMax meet">
        <rect x="150" y="120" width="110" height="180" fill="#170d0f" stroke="#e23a3a" strokeOpacity=".3" strokeWidth="2" />
        <circle cx="244" cy="214" r="4" fill="#ffd166" fillOpacity=".6" />
        {boxes.map(([x, y, w, h, paper, ribbon], index) => (
          <g key={index}>
            <rect x={x} y={y} width={w} height={h} fill={paper} fillOpacity=".55" stroke="#0c0708" strokeWidth="2" />
            <path d={`M${x + w / 2} ${y} V${y + h} M${x} ${y + h / 2} H${x + w}`} stroke={ribbon} strokeOpacity=".75" strokeWidth="5" />
            <path className="se-nl__glint" d={`M${x + 8} ${y + 8} l3 -6 l3 6 l-3 6 Z`} fill="#ffffff" style={{ animationDelay: `${-index * 0.9}s` }} />
          </g>
        ))}
        <path d="M506 300 Q500 250 520 244 Q540 240 548 254 Q560 280 552 300 Z" fill="#1a1416" stroke="#8a7a70" strokeOpacity=".5" />
        <text x="528" y="282" textAnchor="middle" fill="#8a7a70" fillOpacity=".7" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="12">COAL</text>
      </svg>
    </div>
  );
}
