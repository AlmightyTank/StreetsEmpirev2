// Behind the hidden door for the Velvet Speakeasy shell (`velvet-speakeasy-shell`, The Drop): a
// bookcase slid aside on a warm lit bar, a gramophone horn in the top corner and cigar smoke
// curling slowly up the page.
const smoke = [['72%', '-2s', '18s'], ['80%', '-8s', '22s'], ['88%', '-13s', '20s'], ['64%', '-5s', '24s']] as const;

export default function VelvetSpeakeasyScene() {
  return (
    <div className="se-theme-scene se-theme-scene--velvet-speakeasy">
      <svg className="se-vs__gramophone" viewBox="0 0 260 220">
        {/* A gramophone: the cabinet, the tone arm and a flared horn. */}
        <g stroke="#9aa0a6" strokeOpacity=".45" strokeWidth="2">
          <rect x="60" y="160" width="130" height="50" rx="6" fill="#1a0d11" fillOpacity=".8" />
          <ellipse cx="125" cy="160" rx="58" ry="8" fill="#0e0709" />
          <path d="M150 156 L162 130" fill="none" />
          <path d="M160 132 L196 70 L226 84 Z" fill="#2a0710" fillOpacity=".7" strokeLinejoin="round" />
          <ellipse cx="211" cy="77" rx="40" ry="20" transform="rotate(25 211 77)" fill="#7a1f33" fillOpacity=".55" />
          <ellipse cx="211" cy="77" rx="26" ry="12" transform="rotate(25 211 77)" fill="#0e0709" fillOpacity=".7" strokeOpacity=".25" />
        </g>
      </svg>
      <svg className="se-vs__bar" viewBox="0 0 420 320" preserveAspectRatio="xMaxYMax meet">
        <defs>
          <radialGradient id="se-vs-glow" cx=".5" cy=".6" r=".6">
            <stop offset="0" stopColor="#ffb86a" stopOpacity=".35" />
            <stop offset="1" stopColor="#ffb86a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="150" y="40" width="200" height="280" fill="url(#se-vs-glow)" />
        <g stroke="#c2405c" strokeOpacity=".4" strokeWidth="1.4">
          <rect x="40" y="40" width="130" height="280" fill="#1a0d11" />
          {[90, 150, 210, 270].map((y) => <path key={y} d={`M40 ${y} H170`} stroke="#9aa0a6" strokeOpacity=".35" />)}
        </g>
        {Array.from({ length: 4 }, (_, shelf) => Array.from({ length: 9 }, (_, book) => (
          <rect key={`${shelf}-${book}`} x={46 + book * 13.5} y={52 + shelf * 60 + ((book * 7) % 10)} width="11" height={36 - ((book * 7) % 10)} fill={['#4a0f1e', '#2b2d33', '#5a3a20', '#7a1f33'][(book + shelf) % 4]} stroke="#0e0709" strokeWidth=".8" />
        )))}
        <g stroke="#efe4cc" strokeOpacity=".25" strokeWidth="1.4" fill="none">
          <path d="M200 250 H400 M210 250 V320 M390 250 V320" />
          <path d="M230 250 V226 Q230 216 236 212 V200 M260 250 V222 M290 250 V230 Q290 222 296 220 V208" />
        </g>
      </svg>
      <div className="se-vs__smoke">
        {smoke.map(([left, delay, duration], index) => <i key={index} style={{ left, animationDelay: delay, animationDuration: duration }} />)}
      </div>
    </div>
  );
}
