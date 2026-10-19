// After midnight for the Graveyard Shift shell (`graveyard-shift-shell`, a held holiday set): wrought-iron
// cemetery gates, crooked trees and headstones, with fog rolling low across the page.
const stones = [[300, 266, 26, 34], [350, 274, 22, 28], [400, 262, 30, 40], [452, 272, 24, 30], [500, 268, 26, 34]] as const;

export default function GraveyardShiftScene() {
  return (
    <div className="se-theme-scene se-theme-scene--graveyard-shift">
      <svg className="se-gs__yard" viewBox="0 0 560 320" preserveAspectRatio="xMaxYMax meet">
        <g stroke="#0d1214" strokeWidth="6" fill="none" strokeLinecap="round">
          <path d="M120 320 Q126 220 110 150 M114 190 Q90 170 70 176 M116 160 Q140 130 168 134 M110 150 Q100 120 112 96" />
          <path d="M540 320 Q534 240 546 180 M542 220 Q520 200 500 206" />
        </g>
        <g stroke="#6f7d86" strokeOpacity=".45" strokeWidth="3" fill="none">
          <path d="M180 320 V170 Q220 130 260 170 V320" />
          {[196, 212, 228, 244].map((x) => <path key={x} d={`M${x} 320 V${x === 196 || x === 244 ? 182 : 160}`} />)}
          <path d="M180 220 H260 M180 280 H260" />
        </g>
        {stones.map(([x, y, w, h], index) => (
          <path key={index} d={`M${x} ${y + h} V${y + w / 2} Q${x} ${y} ${x + w / 2} ${y} Q${x + w} ${y} ${x + w} ${y + w / 2} V${y + h} Z`} fill="#10161a" stroke="#a8f0c6" strokeOpacity=".22" />
        ))}
        <rect x="0" y="300" width="560" height="20" fill="#07090a" />
      </svg>
      <div className="se-gs__fog" />
    </div>
  );
}
