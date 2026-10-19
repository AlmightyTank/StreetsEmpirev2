// The treasury for the Crown Jewels shell (`crown-jewels-shell`, The Drop): velvet drapes at the
// top corner, a crown on a cushion and a heap of cut stones whose highlights glint in turn.
const gems = [
  // [x, y, size, colour]
  [300, 270, 30, '#2fbf71'], [350, 284, 24, '#e0263f'], [392, 268, 34, '#4a78ff'], [440, 282, 26, '#2fbf71'],
  [480, 270, 30, '#e0263f'], [330, 300, 22, '#4a78ff'], [410, 300, 28, '#e0263f'], [470, 302, 22, '#4a78ff'],
] as const;

const gem = (x: number, y: number, s: number) => `M${x - s / 2} ${y} L${x - s / 4} ${y - s / 3} H${x + s / 4} L${x + s / 2} ${y} L${x} ${y + s / 2} Z`;

export default function CrownJewelsScene() {
  return (
    <div className="se-theme-scene se-theme-scene--crown-jewels">
      <svg className="se-cj__drape" viewBox="0 0 320 220">
        <path d="M320 0 H80 Q120 60 170 70 Q230 80 260 140 Q290 200 320 210 Z" fill="#1a1631" stroke="#4a78ff" strokeOpacity=".35" strokeWidth="1.4" />
        <path d="M120 20 Q160 60 200 70 M180 30 Q220 70 250 110 M240 30 Q270 90 300 160" stroke="#4a78ff" strokeOpacity=".2" fill="none" />
        <path d="M170 70 Q200 90 196 120" stroke="#d9dee6" strokeOpacity=".5" strokeWidth="2" fill="none" />
        <circle cx="196" cy="126" r="6" fill="#d9dee6" fillOpacity=".5" />
      </svg>
      <svg className="se-cj__hoard" viewBox="0 0 560 320" preserveAspectRatio="xMaxYMax meet">
        <ellipse cx="400" cy="220" rx="70" ry="16" fill="#120f24" stroke="#4a78ff" strokeOpacity=".4" />
        <path d="M350 214 L356 170 L376 192 L400 150 L424 192 L444 170 L450 214 Q400 206 350 214 Z" fill="#d9dee6" fillOpacity=".3" stroke="#d9dee6" strokeOpacity=".6" strokeWidth="2" strokeLinejoin="round" />
        <g fillOpacity=".75">
          <circle cx="400" cy="178" r="6" fill="#e0263f" /><circle cx="370" cy="196" r="4" fill="#2fbf71" /><circle cx="430" cy="196" r="4" fill="#4a78ff" />
        </g>
        {gems.map(([x, y, s, color], index) => (
          <g key={index}>
            <path d={gem(x, y, s)} fill={color} fillOpacity=".55" stroke="#f5f3ff" strokeOpacity=".35" />
            <path className="se-cj__glint" d={`M${x - 3} ${y - s / 4} l3 -6 l3 6 l-3 6 Z`} fill="#ffffff" style={{ animationDelay: `${-index * 0.7}s` }} />
          </g>
        ))}
      </svg>
    </div>
  );
}
