import { useEffect, useState } from 'react';
import type { AdminRoundDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';

/**
 * 1.0.0-E. Which season an operator view looks at. Starts on the live round (or
 * the newest one) and remembers nothing: the URL is the only state.
 */
export function useAdminRound(): { rounds: AdminRoundDto[]; roundId: string; setRoundId: (id: string) => void; error: string | null } {
  const [rounds, setRounds] = useState<AdminRoundDto[]>([]);
  const [roundId, setRoundId] = useState(() => new URLSearchParams(window.location.search).get('round') ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminApi.rounds()
      .then((data) => {
        setRounds(data.rounds);
        setRoundId((current) => current || (data.rounds.find((round) => round.status === 'ACTIVE') ?? data.rounds[0])?.id || '');
      })
      .catch(() => setError('Could not load the rounds.'));
  }, []);
  useEffect(() => {
    if (!roundId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('round', roundId);
    window.history.replaceState(null, '', url);
  }, [roundId]);
  return { rounds, roundId, setRoundId, error };
}

export function AdminRoundPicker({ rounds, roundId, onChange }: { rounds: AdminRoundDto[]; roundId: string; onChange: (id: string) => void }) {
  return (
    <label className="se-admin-roundpicker">
      <span className="se-label">Season</span>
      <select className="se-input" value={roundId} onChange={(event) => onChange(event.target.value)}>
        {rounds.map((round) => (
          <option key={round.id} value={round.id}>{round.name} · {round.paused ? 'PAUSED' : round.status.toLowerCase()}</option>
        ))}
      </select>
    </label>
  );
}
