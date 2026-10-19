// The train yard for the Wet Paint shell (`wet-paint-shell`, The Drop): a concrete wall covered in
// tags, a fresh mint piece slowly drawing itself in, and paint running down from the letters.
const tags = [
  'M40 230 q10 -30 24 -4 q8 -26 22 -2 q6 -20 18 0',
  'M150 280 q14 -18 26 0 t26 0 t26 0',
  'M330 270 l10 -28 l10 28 m-16 -10 h12 M372 242 v28 h14',
  'M470 230 q-14 10 0 20 q14 10 0 20',
];

export default function WetPaintScene() {
  return (
    <div className="se-theme-scene se-theme-scene--wet-paint">
      <svg className="se-wp__wall" viewBox="0 0 560 320" preserveAspectRatio="xMaxYMax meet">
        <g stroke="#ffffff" strokeOpacity=".05" strokeWidth="1">
          {Array.from({ length: 8 }, (_, index) => <path key={index} d={`M0 ${40 * index + 20} H560`} />)}
        </g>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {tags.map((d, index) => <path key={index} d={d} stroke={['#ff5fa2', '#9aa0a6', '#ffd400', '#5aa9ff'][index]} strokeOpacity=".45" strokeWidth="4" />)}
        </g>
        {/* The fresh piece: three bubble letters outlined in black over a mint fill. */}
        <g className="se-wp__piece" fill="#36e2a0" fillOpacity=".45" stroke="#0b0d0d" strokeWidth="5" strokeLinejoin="round">
          <path d="M210 120 q-30 0 -30 40 q0 40 30 40 q30 0 30 -18 h-26 v-16 h44 q0 74 -48 74 q-56 0 -56 -80 q0 -80 56 -80 q40 0 46 30 l-22 8 q-6 -18 -24 -18 Z" />
          <path d="M290 100 h28 v98 h40 v22 h-68 Z" />
          <path d="M376 100 h66 v22 h-38 v18 h32 v22 h-32 v58 h-28 Z" />
        </g>
        <g stroke="#36e2a0" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round">
          <path className="se-wp__drip" d="M200 228 v22" />
          <path className="se-wp__drip se-wp__drip--late" d="M304 222 v30" />
          <path className="se-wp__drip" d="M392 238 v18" />
        </g>
      </svg>
    </div>
  );
}
