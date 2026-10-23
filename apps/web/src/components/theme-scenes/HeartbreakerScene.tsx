// After a bad breakup for the Heartbreaker shell (`heartbreaker-shell`, a held holiday set): rain on the
// street and a broken-heart sign over a door, flickering softly (never a hard flash).
export default function HeartbreakerScene() {
  return (
    <div className="se-theme-scene se-theme-scene--heartbreaker">
      <div className="se-hb__rain" />
      <svg className="se-hb__sign" viewBox="0 0 320 260">
        <defs>
          <filter id="se-hb-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g className="se-hb__tube" fill="none" stroke="#ff4d6d" strokeWidth="5" strokeLinejoin="round" filter="url(#se-hb-glow)">
          <path d="M150 210 L80 140 Q50 104 80 80 Q110 58 140 90 L130 120 L156 140 L144 170" />
          <path d="M166 200 L230 140 Q260 104 230 80 Q200 58 172 88 L180 118 L162 142" />
        </g>
      </svg>
      <div className="se-hb__street" />
    </div>
  );
}
