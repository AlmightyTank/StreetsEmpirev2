// The harbour after dark for the Dockside shell (`dockside-shell`, The Drop): container cranes
// over stacked boxes, fog lying on the water and a searchlight sweeping slowly across.
const stacks = [
  // [x, row, colour]
  [250, 0, '#ff7a2f'], [326, 0, '#2a4566'], [402, 0, '#8a4a2a'], [478, 0, '#2a4566'],
  [288, 1, '#5b9bd5'], [364, 1, '#ff7a2f'], [440, 1, '#2a4566'], [326, 2, '#8a4a2a'],
] as const;

export default function DocksideScene() {
  return (
    <div className="se-theme-scene se-theme-scene--dockside">
      <svg className="se-dk__light" viewBox="0 0 400 400">
        <path className="se-dk__beam" d="M380 20 L60 300 L160 340 Z" fill="#cfe3f5" fillOpacity=".06" />
        <circle cx="380" cy="20" r="8" fill="#f3f8fc" fillOpacity=".5" />
      </svg>
      <svg className="se-dk__port" viewBox="0 0 560 320" preserveAspectRatio="xMaxYMax meet">
        <g stroke="#5b9bd5" strokeOpacity=".35" strokeWidth="3" fill="none">
          <path d="M120 300 V60 H300 M120 60 L60 90 M160 60 V300 M120 120 H160 M120 180 H160 M120 240 H160" />
          <path d="M240 60 V110 M226 110 H254" />
          <path d="M420 300 V100 H540 M420 100 L380 120 M450 100 V300" />
        </g>
        {stacks.map(([x, row, color], index) => (
          <g key={index}>
            <rect x={x} y={268 - row * 32} width="72" height="30" fill={color} fillOpacity=".55" stroke="#060b12" strokeWidth="2" />
            {Array.from({ length: 8 }, (_, rib) => <path key={rib} d={`M${x + 6 + rib * 8.5} ${271 - row * 32} V${295 - row * 32}`} stroke="#060b12" strokeOpacity=".4" />)}
          </g>
        ))}
        <rect x="0" y="300" width="560" height="20" fill="#0e1621" />
      </svg>
      <div className="se-dk__fog" />
    </div>
  );
}
