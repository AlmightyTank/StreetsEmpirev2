import { useEffect, useState } from 'react';
import type { HallOfFameDto, HallOfFameRoundDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { formatDate } from '../utils/time.js';

function medal(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `#${rank}`;
}

function seasonWindow(round: HallOfFameRoundDto): string {
  return `${formatDate(round.startsAt)} - ${formatDate(round.endedAt)}`;
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
          <p className="se-eyebrow">Season archive</p>
        </div>
      </div>

      <Panel title="Fair competitive seasons">
        <p className="se-dim">
          Every archived season is a finished contest. Money, crew, supplies, weapons and combat state stayed inside that round;
          only history, placements, badges and cosmetics carry forward.
        </p>
      </Panel>

      {error ? <Alert>{error}</Alert> : null}

      {!data ? (
        <Panel title="Loading"><p className="se-muted">Pulling the old ledgers...</p></Panel>
      ) : data.rounds.length === 0 ? (
        <Panel title="No finished seasons"><p className="se-muted">The first finished round will land here.</p></Panel>
      ) : (
        <div className="se-grid se-archive-list">
          {data.rounds.map((round) => (
            <Panel key={round.id} title={round.name} aside={formatDate(round.endedAt)}>
              <div className="se-stats se-archive-stats">
                <Stat label="Players" value={formatNumber(round.playerCount)} />
                <Stat label="Ruleset" value={round.rulesetVersion} />
                <Stat label="Window" value={seasonWindow(round)} />
              </div>

              {round.podium.length ? (
                <>
                  <div className="se-podium">
                    {round.podium.map((player) => (
                      <article className={`se-podium-card se-podium-card--${player.rank}`} key={`${round.id}-${player.rank}-${player.publicPimpId}`}>
                        <span className="se-podium-card__rank">{medal(player.rank)}</span>
                        <strong>{player.displayName}</strong>
                        <span>{player.city}</span>
                        <span className="se-num">{formatCents(player.netWorthCents)}</span>
                      </article>
                    ))}
                  </div>

                  <div className="se-tablewrap se-mt">
                    <table className="se-table">
                      <thead>
                        <tr>
                          <th>Finish</th>
                          <th>Player</th>
                          <th>City</th>
                          <th className="se-table__number">Final Net Worth</th>
                          <th className="se-table__number">Cash Left</th>
                          <th className="se-table__number">Hideout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {round.topTen.map((player) => (
                          <tr key={`${round.id}-top-${player.rank}-${player.publicPimpId}`}>
                            <td className="se-num">{medal(player.rank)}</td>
                            <td>{player.displayName}</td>
                            <td>{player.city}</td>
                            <td className="se-table__number se-num">{formatCents(player.netWorthCents)}</td>
                            <td className="se-table__number se-num">{formatCents(player.cashCents)}</td>
                            <td className="se-table__number se-num">{formatNumber(player.hideout.totalLevel)} / {formatNumber(player.hideout.totalMaxLevel)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div>
                  <p className="se-muted">No final standings recorded.</p>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </GameLayout>
  );
}
