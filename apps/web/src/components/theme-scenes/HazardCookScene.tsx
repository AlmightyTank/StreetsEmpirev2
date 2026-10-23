// The cookhouse for the Hazard Cook shell (`hazard-cook-shell`, The Drop): a desert lab at dusk,
// flasks bubbling on the bench and a work lamp with a soft flicker. Warning stripes edge the bench.
const bubbles = [['78%', '-1s', '5s', 5], ['82%', '-3s', '6s', 4], ['86%', '-2s', '4.5s', 6], ['90%', '-4s', '5.5s', 3]] as const;

export default function HazardCookScene() {
  return (
    <div className="se-theme-scene se-theme-scene--hazard-cook">
      <svg className="se-hc__lamp" viewBox="0 0 220 260">
        <path d="M150 0 V60" stroke="#c7ccd2" strokeOpacity=".5" strokeWidth="2" />
        <path d="M120 60 H180 L170 84 H130 Z" fill="#202015" stroke="#ffd400" strokeOpacity=".5" />
        <path className="se-hc__cone" d="M130 84 H170 L220 260 H80 Z" fill="#ffd400" fillOpacity=".08" />
      </svg>
      <svg className="se-hc__bench" viewBox="0 0 560 300" preserveAspectRatio="xMaxYMax meet">
        <defs>
          <pattern id="se-hc-stripe" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="20" height="20" fill="#ffd400" />
            <rect width="10" height="20" fill="#111111" />
          </pattern>
        </defs>
        <path d="M0 200 L60 150 H140 L190 200 Z M330 200 L380 160 H470 L520 200 Z" fill="#17170f" stroke="#ffd400" strokeOpacity=".18" />
        <rect x="200" y="236" width="360" height="14" fill="url(#se-hc-stripe)" opacity=".7" />
        <rect x="200" y="250" width="360" height="50" fill="#17170f" />
        <g stroke="#c7ccd2" strokeOpacity=".6" strokeWidth="2" fill="#ffd400" fillOpacity=".18">
          <path d="M292 160 V196 L262 236 H346 L316 196 V160 Z" />
          <path d="M402 180 V206 L382 236 H446 L426 206 V180 Z" />
          <rect x="478" y="170" width="22" height="66" rx="4" />
        </g>
        <path d="M268 226 H340 M386 228 H442" stroke="#ffd400" strokeOpacity=".5" strokeWidth="6" />
      </svg>
      <div className="se-hc__bubbles">
        {bubbles.map(([left, delay, duration, size], index) => <i key={index} style={{ left, animationDelay: delay, animationDuration: duration, width: size, height: size }} />)}
      </div>
    </div>
  );
}
