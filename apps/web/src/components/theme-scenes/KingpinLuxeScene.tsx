// Black-lacquer night for the Kingpin Luxe shell (`kingpin-luxe-shell`, The Drop): a deco sunburst
// in the top corner, private towers with a few lit brass windows, and one slow glint along the trim.
const towers = [
  // [x, width, height, crown]
  [0, 70, 210, 'step'], [64, 52, 290, 'spire'], [110, 84, 240, 'step'], [188, 60, 330, 'spire'],
  [242, 92, 260, 'fan'], [328, 58, 200, 'step'], [380, 76, 300, 'spire'], [450, 70, 230, 'step'],
] as const;

function crown(x: number, w: number, top: number, kind: string): string {
  const mid = x + w / 2;
  if (kind === 'spire') return `M${x + w * 0.2} ${top} L${mid} ${top - 46} L${x + w * 0.8} ${top} Z`;
  if (kind === 'fan') return `M${x + 6} ${top} A${w / 2 - 6} ${w / 2 - 6} 0 0 1 ${x + w - 6} ${top} Z`;
  return `M${x + 10} ${top} V${top - 14} H${x + w - 10} V${top} Z M${x + 22} ${top - 14} V${top - 26} H${x + w - 22} V${top - 14} Z`;
}

export default function KingpinLuxeScene() {
  return (
    <div className="se-theme-scene se-theme-scene--kingpin-luxe">
      <svg className="se-kl__sunburst" viewBox="0 0 400 400">
        <g stroke="#d6a35c" strokeOpacity=".32" strokeWidth="1.4" fill="none">
          {Array.from({ length: 13 }, (_, index) => {
            const angle = (Math.PI / 2) * (index / 12) + Math.PI / 2;
            return <path key={index} d={`M400 0 L${400 + Math.cos(angle) * 380} ${Math.sin(angle) * 380}`} />;
          })}
          <path d="M400 120 A120 120 0 0 1 280 0 M400 210 A210 210 0 0 1 190 0 M400 300 A300 300 0 0 1 100 0" strokeOpacity=".22" />
        </g>
      </svg>
      <svg className="se-kl__skyline" viewBox="0 0 520 360" preserveAspectRatio="xMaxYMax meet">
        <defs>
          <linearGradient id="se-kl-tower" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b1a20" />
            <stop offset="1" stopColor="#070709" />
          </linearGradient>
        </defs>
        {towers.map(([x, w, h, kind], index) => {
          const top = 360 - h;
          return (
            <g key={index}>
              <path d={crown(x, w, top, kind)} fill="#121116" stroke="#d6a35c" strokeOpacity=".5" strokeWidth="1.2" />
              <rect x={x} y={top} width={w} height={h} fill="url(#se-kl-tower)" stroke="#d6a35c" strokeOpacity=".35" strokeWidth="1" />
              <path d={`M${x + w / 2} ${top + 8} V360`} stroke="#d6a35c" strokeOpacity=".16" />
              {Array.from({ length: Math.floor(h / 34) }, (_, row) => (
                (row + index) % 3 === 0
                  ? <rect key={row} className="se-kl__window" x={x + 8 + ((row * 13) % Math.max(8, w - 22))} y={top + 18 + row * 32} width="7" height="10" fill="#e9c98e" style={{ animationDelay: `${-(row + index) * 1.7}s` }} />
                  : null
              ))}
            </g>
          );
        })}
      </svg>
      <div className="se-kl__trim" />
    </div>
  );
}
