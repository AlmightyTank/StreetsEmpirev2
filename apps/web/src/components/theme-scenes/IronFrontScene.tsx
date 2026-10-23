import type { CSSProperties } from 'react';

/** Quiet command-room backdrop for the Iron Front shell. */
export function IronFrontScene() {
  return (
    <div className="se-iron-front-scene" aria-hidden="true" style={{ '--se-iron-grid': 'rgba(217, 54, 62, .16)' } as CSSProperties}>
      <div className="se-iron-front-scene__grid" />
      <div className="se-iron-front-scene__beacon" />
    </div>
  );
}

export default IronFrontScene;
