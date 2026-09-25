import { useEffect, useState } from 'react';
import type { HallOfFameDto, HallOfFameRoundDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { HideoutRoomChips } from '../components/HideoutRoomChips.js';
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

  const latestRound = data?.rounds[0] ?? null;
  const latestChampion = latestRound?.podium.find((player) => player.rank === 1) ?? latestRound?.podium[0] ?? null;
  const archivedPlayers = data?.rounds.reduce((sum, round) => sum + round.playerCount, 0) ?? 0;
  const podiumPlaces = data?.rounds.reduce((sum, round) => sum + round.podium.length, 0) ?? 0;

  return (
    <GameLayout>
      <div className="se-fame">
        <section className="se-info-hero se-info-hero--fame">
          <div className="se-info-hero__copy">
            <span className="se-info-hero__kicker">Permanent record</span>
            <h1 className="se-info-hero__title">Hall of Fame</h1>
            <p className="se-info-hero__body">Finished seasons, podiums and territory records. Every round starts clean, but the names that owned it stay on the wall.</p>
          </div>
          <div className="se-info-hero__readout" aria-label="Hall of Fame summary">
            <span><small>Seasons</small><strong>{data ? formatNumber(data.rounds.length) : '—'}</strong></span>
            <span><small>Players recorded</small><strong>{data ? formatNumber(archivedPlayers) : '—'}</strong></span>
            <span><small>Podium places</small><strong>{data ? formatNumber(podiumPlaces) : '—'}</strong></span>
            <span><small>Latest champion</small><strong>{latestChampion?.displayName ?? '—'}</strong></span>
          </div>
        </section>

        <section className="se-info-section">
          <div className="se-info-sectionhead">
            <div>
              <span className="se-eyebrow">Legacy rules</span>
              <h2>Win the season, keep the receipt</h2>
            </div>
            <p>Power resets. Placements, badges, cosmetics and the public record are what survive the bell.</p>
          </div>
          <div className="se-info-principles">
            <article>
              <span>01</span>
              <strong>Fresh starts</strong>
              <p>Cash, crew, stock, weapons, turns and combat state stay inside the season that earned them.</p>
            </article>
            <article>
              <span>02</span>
              <strong>Permanent history</strong>
              <p>Finished standings and territory leaders remain visible after the round closes.</p>
            </article>
            <article>
              <span>03</span>
              <strong>No carryover power</strong>
              <p>Legacy rewards are identity and bragging rights, not a mechanical head start next season.</p>
            </article>
          </div>
        </section>

      {error ? <Alert>{error}</Alert> : null}

      {!data ? (
        <div className="se-info-loading" role="status">Pulling the old ledgers...</div>
      ) : data.rounds.length === 0 ? (
        <div className="se-info-empty"><strong>No finished seasons yet.</strong><span>The first final standings will land here after the bell.</span></div>
      ) : (
        <section className="se-info-section">
          <div className="se-info-sectionhead">
            <div>
              <span className="se-eyebrow">Season archive</span>
              <h2>Finished rounds</h2>
            </div>
            <span className="se-info-sectionhead__meta">{formatNumber(data.rounds.length)} seasons · newest first</span>
          </div>
          <div className="se-fame__archive">
          {data.rounds.map((round) => (
            <section className="se-panel se-fame__season" key={round.id}>
              <div className="se-fame__season-head">
                <div>
                  <span className="se-eyebrow">Archived season</span>
                  <h2>{round.name}</h2>
                  <div className="se-fame__season-meta">
                    <span>{formatDate(round.startsAt)} → {formatDate(round.endedAt)}</span>
                    <span>{round.rulesetVersion}</span>
                  </div>
                </div>
                <div className="se-fame__season-count">
                  <strong>{formatNumber(round.playerCount)}</strong>
                  <span>players</span>
                </div>
              </div>
              <div className="se-fame__metrics">
                <div><span>Champion</span><strong>{round.podium.find((player) => player.rank === 1)?.displayName ?? 'No winner recorded'}</strong></div>
                <div><span>Field</span><strong>{formatNumber(round.playerCount)} players</strong></div>
                <div><span>Ruleset</span><strong>{round.rulesetVersion}</strong></div>
                <div><span>Window</span><strong>{seasonWindow(round)}</strong></div>
              </div>

              {round.territory && (round.territory.crews.length || round.territory.alliances.length) ? (
                <div className="se-mt">
                  <h3 className="se-city__heading">Turf Hall of Fame</h3>
                  <div className="se-fame__territory">
                    {round.territory.crews.map((crew) => (
                      <div className="se-fame__territory-row" key={`crew-${crew.publicPimpId}`}>
                        <span className="se-fame__territory-label">Crew leader</span>
                        <span className="se-fame__territory-value"><AllianceTag alliance={crew.alliance} link={false} />{crew.displayName} · <span className="se-num">{turfTime(crew.heldSeconds)}</span></span>
                      </div>
                    ))}
                    {round.territory.alliances.map((alliance) => (
                      <div className="se-fame__territory-row" key={`alliance-${alliance.tag}`}>
                        <span className="se-fame__territory-label">Alliance leader</span>
                        <span className="se-fame__territory-value">[{alliance.tag}] {alliance.name} · <span className="se-num">{turfTime(alliance.heldSeconds)}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {round.podium.length ? (
                <>
                  <div className="se-fame__podium">
                    {round.podium.map((player) => (
                      <article className={`se-fame__podium-card se-fame__podium-card--${player.rank}`} key={`${round.id}-${player.rank}-${player.publicPimpId}`}>
                        <span className="se-fame__podium-card__rank">{medal(player.rank)}</span>
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
                <div className="se-fame__empty">No final standings recorded.</div>
              )}
            </section>
          ))}
          </div>
        </section>
      )}
      </div>
    </GameLayout>
  );
}
