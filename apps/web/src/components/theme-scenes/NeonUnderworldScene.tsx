// After-hours street for the Neon Underworld shell (`neon-underworld-shell`, The Drop): neon tube
// signs in the top corner with a slow, soft buzz (never a hard flash), fine rain, and their
// violet and teal light pooling on the wet street at the bottom.
export default function NeonUnderworldScene() {
  return (
    <div className="se-theme-scene se-theme-scene--neon-underworld">
      <div className="se-nu__rain" />
      <svg className="se-nu__signs" viewBox="0 0 420 260">
        <defs>
          <filter id="se-nu-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#se-nu-glow)">
          {/* A crown sign over a door. */}
          <g className="se-nu__tube se-nu__tube--violet">
            <path d="M250 110 l14 -34 l22 22 l22 -30 l22 30 l22 -22 l14 34 Z" stroke="#c48bff" strokeWidth="4" />
          </g>
          {/* "OPEN LATE" in tube lettering. */}
          <g className="se-nu__tube se-nu__tube--teal">
            <path d="M210 160 h150 a12 12 0 0 1 12 12 v26 a12 12 0 0 1 -12 12 h-150 a12 12 0 0 1 -12 -12 v-26 a12 12 0 0 1 12 -12 Z" stroke="#39e6d6" strokeWidth="3" />
            <text x="285" y="193" textAnchor="middle" fill="#7af3e8" stroke="none" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="22" letterSpacing="4">OPEN LATE</text>
          </g>
          {/* An arrow down the wall. */}
          <g className="se-nu__tube se-nu__tube--pink">
            <path d="M130 40 v110 m-16 -16 l16 16 l16 -16" stroke="#ff5fc1" strokeWidth="4" />
          </g>
        </g>
      </svg>
      <div className="se-nu__street" />
    </div>
  );
}
