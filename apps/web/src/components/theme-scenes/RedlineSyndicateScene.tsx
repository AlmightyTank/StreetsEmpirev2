// The midnight meet for the Redline Syndicate shell (`redline-syndicate-shell`, The Drop): a
// parking-garage level with striped pillars and strip lights, and red and white light trails
// streaking low across the page.
const pillars = [80, 220, 360, 500];

export default function RedlineSyndicateScene() {
  return (
    <div className="se-theme-scene se-theme-scene--redline-syndicate">
      <svg className="se-rs__garage" viewBox="0 0 560 320" preserveAspectRatio="xMaxYMax meet">
        <path d="M0 40 H560" stroke="#1a1d21" strokeWidth="40" />
        {[60, 200, 340, 480].map((x) => <rect key={x} x={x} y="22" width="70" height="6" rx="3" fill="#f3f4f6" opacity=".55" />)}
        {pillars.map((x) => (
          <g key={x}>
            <rect x={x} y="60" width="34" height="260" fill="#121417" stroke="#2a2d32" />
            <path d={`M${x} 280 l34 -20 M${x} 300 l34 -20 M${x} 320 l34 -20`} stroke="#ff3344" strokeOpacity=".7" strokeWidth="8" />
            <text x={x + 17} y="110" textAnchor="middle" fill="#f3f4f6" fillOpacity=".4" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="18">B2</text>
          </g>
        ))}
        <path d="M0 318 H560" stroke="#ff3344" strokeOpacity=".2" strokeWidth="4" strokeDasharray="30 20" />
      </svg>
      <svg className="se-rs__trails" viewBox="0 0 1000 120" preserveAspectRatio="none">
        <path className="se-rs__trail" d="M0 70 Q500 40 1000 60" stroke="#ff3344" strokeWidth="3" fill="none" />
        <path className="se-rs__trail se-rs__trail--white" d="M0 90 Q500 70 1000 82" stroke="#f3f4f6" strokeWidth="2" fill="none" />
        <path className="se-rs__trail se-rs__trail--slow" d="M0 104 Q500 92 1000 100" stroke="#ff3344" strokeOpacity=".6" strokeWidth="2" fill="none" />
      </svg>
    </div>
  );
}
