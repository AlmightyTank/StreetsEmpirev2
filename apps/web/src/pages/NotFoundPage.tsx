import { useEffect, useRef, useState } from 'react';
import '../styles/easter-eggs.css';
import { Link } from 'react-router-dom';
import { easterEggsApi } from '../api/easterEggs.js';
import { InfoLayout } from '../layouts/InfoLayout.js';
import { useSession } from '../stores/session.js';

/** A corner dealer under a dead streetlamp, with no idea where he is either. */
function LostDealerArt() {
  return (
    <svg className="se-not-found__art" viewBox="0 0 160 160" aria-hidden="true">
      <defs>
        <linearGradient id="se-lost-hoodie" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4f58" />
          <stop offset="1" stopColor="#1f2227" />
        </linearGradient>
        <radialGradient id="se-lost-glow" cx=".5" cy="0" r="1">
          <stop offset="0" stopColor="#ffd27a" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
        </radialGradient>
        <filter id="se-lost-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity=".6" />
        </filter>
      </defs>
      <path d="M118 30 L150 150 H70 Z" fill="url(#se-lost-glow)" className="se-not-found__lamp-glow" />
      <ellipse cx="80" cy="150" rx="62" ry="5" fill="#000" opacity=".45" />
      <g filter="url(#se-lost-shadow)" stroke="#060607" strokeWidth="1.6" strokeLinejoin="round">
        {/* streetlamp */}
        <path d="M128 150 V26 Q128 18 120 18 H108" fill="none" stroke="#2a2d33" strokeWidth="4" />
        <path d="M100 16 H116 L112 24 H104 Z" fill="#3a3e45" />
        {/* the dealer */}
        <path d="M52 150 L56 104 Q58 92 70 90 H84 Q96 92 98 104 L102 150 Z" fill="url(#se-lost-hoodie)" />
        <path d="M62 92 Q60 66 77 62 Q94 66 92 92 Z" fill="url(#se-lost-hoodie)" />
        <ellipse cx="77" cy="82" rx="9" ry="10" fill="#14161a" />
        <path d="M70 128 H84" stroke="#2a2d33" />
      </g>
      <g fill="#e8eef3">
        <circle cx="73.5" cy="81" r="1.6" />
        <circle cx="80.5" cy="81" r="1.6" />
      </g>
      <text x="96" y="64" className="se-not-found__question" fontSize="26" fontWeight="900" fill="#ffd27a">?</text>
    </svg>
  );
}

/** Every unknown address lands here, signed in or not. */
export function NotFoundPage() {
  const signedIn = useSession((s) => Boolean(s.account));
  const reported = useRef(false);
  const [unlocked, setUnlocked] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || reported.current) return;
    reported.current = true;
    easterEggsApi.found('WRONG_TURN')
      .then((found) => { if (found.isNew) setUnlocked(found.title); })
      .catch(() => undefined);
  }, [signedIn]);

  return (
    <InfoLayout>
      <section className="se-not-found">
        <LostDealerArt />
        <div className="se-not-found__copy">
          <span className="se-eyebrow">404 · Wrong block</span>
          <h1>You’re not supposed to be here, man.</h1>
          <p className="se-muted">This street is not on any map. Turn around before somebody notices you looking.</p>
          {unlocked ? <p className="se-not-found__unlock">Title unlocked: <strong>{unlocked}</strong></p> : null}
          <Link className="se-btn se-btn--primary" to="/">Back to the block</Link>
        </div>
      </section>
    </InfoLayout>
  );
}
