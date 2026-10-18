import { useEffect, useState } from 'react';
import { isDoubleExperienceWeekend, nextDoubleExperienceChange, doubleExperienceWeekendEndsAt } from '@streets/shared';
import { formatWeekdayTime } from '../utils/time.js';

/** Tracks Saturday and Sunday UTC, and refreshes when that window opens or closes. */
export function useDoubleExperienceWeekend(): { active: boolean; endsAt: Date | null } {
  const [at, setAt] = useState(() => new Date());

  useEffect(() => {
    const changeAt = nextDoubleExperienceChange(at);
    const delay = Math.min(Math.max(1_000, changeAt.getTime() - Date.now()), 2_147_000_000);
    const timer = window.setTimeout(() => setAt(new Date()), delay);
    return () => window.clearTimeout(timer);
  }, [at]);

  return {
    active: isDoubleExperienceWeekend(at),
    endsAt: doubleExperienceWeekendEndsAt(at),
  };
}

export function DoubleXpMark({ active }: { active: boolean }) {
  if (!active) return null;
  return <span className="se-double-xp-mark">2×</span>;
}

/** Shown in the game frame while lifetime XP from turns and jobs is doubled. */
export function DoubleXpBanner({ active, endsAt }: { active: boolean; endsAt: Date | null }) {
  if (!active || !endsAt) return null;
  return (
    <div className="se-beta-banner se-double-xp" role="status">
      <strong>DOUBLE XP</strong>
      <span>
        Turns and finished jobs pay double lifetime XP through {formatWeekdayTime(endsAt)} your time (Monday 00:00 UTC).
      </span>
    </div>
  );
}
