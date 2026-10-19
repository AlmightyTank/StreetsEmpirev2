// The back room for the Snake Eyes shell (`snake-eyes-shell`, The Drop): a card table under a low
// lamp that swings gently, chip stacks, a fanned hand and a pair of dice showing snake eyes.
const chips = [[330, '#e0263f'], [360, '#f6f1e3'], [390, '#141416'], [420, '#1fae6a']] as const;

export default function SnakeEyesScene() {
  return (
    <div className="se-theme-scene se-theme-scene--snake-eyes">
      <svg className="se-se__lamp" viewBox="0 0 240 300">
        <g className="se-se__swing">
          <path d="M120 0 V90" stroke="#c3c6b4" strokeOpacity=".5" strokeWidth="2" />
          <path d="M80 110 Q120 76 160 110 Z" fill="#0c1a12" stroke="#1fae6a" strokeOpacity=".5" />
          <path d="M80 110 L20 300 H220 L160 110 Z" fill="#fff6d8" fillOpacity=".06" />
        </g>
      </svg>
      <svg className="se-se__table" viewBox="0 0 560 300" preserveAspectRatio="xMaxYMax meet">
        <ellipse cx="380" cy="250" rx="240" ry="70" fill="#0c3a22" fillOpacity=".7" stroke="#5a3a20" strokeOpacity=".7" strokeWidth="10" />
        <ellipse cx="380" cy="250" rx="200" ry="52" fill="none" stroke="#f6f1e3" strokeOpacity=".12" strokeWidth="2" />
        {chips.map(([x, color]) => Array.from({ length: 4 }, (_, level) => (
          <ellipse key={`${x}-${level}`} cx={x} cy={236 - level * 6} rx="14" ry="5" fill={color} fillOpacity=".75" stroke="#050b08" strokeWidth="1" />
        )))}
        <g transform="translate(470 222)">
          {[-24, -8, 8, 24].map((angle, index) => (
            <g key={angle} transform={`rotate(${angle})`}>
              <rect x="-10" y="-34" width="20" height="30" rx="2" fill="#f6f1e3" fillOpacity=".8" stroke="#050b08" />
              <text x="0" y="-16" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="10" fill={index % 2 ? '#141416' : '#e0263f'}>{['A', 'K', 'Q', 'J'][index]}</text>
            </g>
          ))}
        </g>
        <g fill="#f6f1e3" fillOpacity=".85" stroke="#050b08">
          <rect x="250" y="250" width="22" height="22" rx="4" transform="rotate(-12 261 261)" />
          <rect x="280" y="256" width="22" height="22" rx="4" transform="rotate(10 291 267)" />
        </g>
        <g fill="#e0263f"><circle cx="261" cy="261" r="3" /><circle cx="291" cy="267" r="3" /></g>
      </svg>
    </div>
  );
}
