import { useEffect, useState } from 'react';
import type { HallOfFameDto, HallOfFameRoundDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { HideoutRoomChips } from '../components/HideoutRoomChips.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { formatDate } from '../utils/time.js';
import { AllianceTag } from '../components/AllianceTag.js';

function medal(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `#${rank}`;
}

function seasonWindow(round: HallOfFameRoundDto): string {
  return `${formatDate(round.startsAt)} - ${formatDate(round.endedAt)}`;
}

function turfTime(seconds: number): string {
  const hours = seconds / 3600;
  return hours < 48 ? `${hours.toFixed(hours < 10 ? 1 : 0)}h` : `${(hours / 24).toFixed(1)}d`;
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

              {round.territory && (round.territory.crews.length || round.territory.alliances.length) ? (
                <div className="se-mt">
                  <h3 className="se-city__heading">Turf Hall of Fame</h3>
                  <div className="se-rows">
                    {round.territory.crews.map((crew) => (
                      <div className="se-row" key={`crew-${crew.publicPimpId}`}>
                        <span className="se-row__label">Crew leader</span>
                        <span className="se-row__value"><AllianceTag alliance={crew.alliance} link={false} />{crew.displayName} · <span className="se-num">{turfTime(crew.heldSeconds)}</span></span>
                      </div>
                    ))}
                    {round.territory.alliances.map((alliance) => (
                      <div className="se-row" key={`alliance-${alliance.tag}`}>
                        <span className="se-row__label">Alliance leader</span>
                        <span className="se-row__value">[{alliance.tag}] {alliance.name} · <span className="se-num">{turfTime(alliance.heldSeconds)}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {round.podium.length ? (
                <>
                  <div className="se-podium">
                    {round.podium.map((player) => (
                      <article className={`se-podium-card se-podium-card--${player.rank}`} key={`${round.id}-${player.rank}-${player.publicPimpId}`}>
                        <span className="se-podium-card__rank">{medal(player.rank)}</span>
                        <strong><AllianceTag alliance={player.alliance} link={false} />{player.displayName}</strong>
                        <span>{player.city}</span>
                        <span className="se-num">{formatCents(player.netWorthCents)}</span>
                      </article>
                    ))}
                  </div>

                  <div className="se-tablewrap se-mt">
                    <table className="se-table se-table--cards">
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
                            <td className="se-num" data-label="Finish">{medal(player.rank)}</td>
                            <td className="se-td--title"><AllianceTag alliance={player.alliance} link={false} />{player.displayName}</td>
                            <td data-label="City">{player.city}</td>
                            <td className="se-table__number se-num" data-label="Final net worth">{formatCents(player.netWorthCents)}</td>
                            <td className="se-table__number se-num" data-label="Cash left">{formatCents(player.cashCents)}</td>
                            <td className="se-table__number" data-label="Hideout"><HideoutRoomChips hideout={player.hideout} /></td>
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
