import { useEffect, useState } from 'react';
import type { HallOfFameDto } from '@streets/shared';
import { formatCents } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { formatDate } from '../utils/time.js';

function medal(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `#${rank}`;
}

export function HallOfFamePage() {
  const [data, setData] = useState<HallOfFameDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    communityApi.hallOfFame()
      .then(setData)
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : 'Could not load the hall of fame.');
      });
  }, []);

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Hall of Fame</h1>
          <p className="se-eyebrow">Past season podiums</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {!data ? (
        <Panel title="Loading"><p className="se-muted">Pulling the old ledgers...</p></Panel>
      ) : data.rounds.length === 0 ? (
        <Panel title="No finished seasons"><p className="se-muted">The first finished round will land here.</p></Panel>
      ) : (
        <div className="se-grid">
          {data.rounds.map((round) => (
            <Panel key={`${round.name}-${round.endedAt}`} title={round.name} aside={formatDate(round.endedAt)} flush>
              {round.podium.length ? (
                <div className="se-tablewrap">
                  <table className="se-table">
                    <thead>
                      <tr>
                        <th>Finish</th>
                        <th>Player</th>
                        <th>City</th>
                        <th className="se-table__number">Final Net Worth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {round.podium.map((player) => (
                        <tr key={`${round.name}-${player.rank}-${player.displayName}`}>
                          <td className="se-num">{medal(player.rank)}</td>
                          <td>{player.displayName}</td>
                          <td>{player.city}</td>
                          <td className="se-table__number se-num">{formatCents(player.netWorthCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="se-panel__body"><p className="se-muted">No final standings recorded.</p></div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </GameLayout>
  );
}
