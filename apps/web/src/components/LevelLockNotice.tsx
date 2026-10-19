import { Link } from 'react-router-dom';
import { ACCOUNT_TRUST_GATES, accountGateOpen, formatNumber, type AccountTrustGate } from '@streets/shared';
import { useSession } from '../stores/session.js';
import { Alert } from './Alert.js';

/**
 * Tells a new player which of these account level unlocks are still closed on
 * this page, and when each opens. Renders nothing once they are all open.
 */
export function LevelLockNotice({ gates }: { gates: readonly AccountTrustGate[] }) {
  const experience = useSession((state) => state.me?.experience ?? null);
  if (!experience) return null;
  const locked = gates.filter((gate) => !accountGateOpen(experience, gate));
  if (!locked.length) return null;
  const first = Math.min(...locked.map((gate) => ACCOUNT_TRUST_GATES[gate].level));
  return (
    <Alert tone="info" title={`Opens at account level ${formatNumber(first)}`}>
      You are level {formatNumber(experience.level)}. Spend turns and finish jobs to earn XP.
      <ul className="se-level-lock__list">
        {locked.map((gate) => (
          <li key={gate}>{ACCOUNT_TRUST_GATES[gate].label}: level {formatNumber(ACCOUNT_TRUST_GATES[gate].level)}</li>
        ))}
      </ul>
      <Link to="/game/xp-progress">See your level track</Link>.
    </Alert>
  );
}
