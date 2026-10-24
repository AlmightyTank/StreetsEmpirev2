import { useEffect, useState } from 'react';
import type { AdminStoryCampaignDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Panel } from './Panel.js';

/** Share of `part` in `whole`, as a whole percent, or a dash when there is nothing to divide. */
export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

/**
 * Story campaign Slice J. The Missing Line for one round: how many crews finished each chapter,
 * how many of those went on to finish the next (drop-off), how scenes were answered, and endings.
 */
export function AdminStoryCampaignPanel({ roundId }: { roundId: string }) {
  const [data, setData] = useState<AdminStoryCampaignDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    let live = true;
    setData(null);
    setError(null);
    adminApi.storyCampaign(roundId)
      .then((result) => { if (live) setData(result); })
      .catch((caught) => { if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load the campaign report.'); });
    return () => { live = false; };
  }, [roundId]);

  const aside = data ? `${formatNumber(data.players)} crews` : undefined;
  if (error) return <Panel title="The Missing Line" className="se-mb"><p className="se-muted">{error}</p></Panel>;
  if (!data) return <Panel title="The Missing Line" className="se-mb"><p className="se-muted">Loading campaign report...</p></Panel>;
  if (!data.chapters.length) {
    return <Panel title="The Missing Line" aside={aside} className="se-mb"><p className="se-muted">This round's ruleset has no campaign.</p></Panel>;
  }

  return (
    <Panel title="The Missing Line" aside={aside} flush className="se-mb">
      <div className="se-tablewrap">
        <table className="se-table se-table--cards">
          <thead>
            <tr>
              <th>Chapter</th>
              <th className="se-table__number">Available</th>
              <th className="se-table__number">Active</th>
              <th className="se-table__number">Ready</th>
              <th className="se-table__number">Completed</th>
              <th className="se-table__number">Kept going</th>
            </tr>
          </thead>
          <tbody>
            {data.chapters.map((chapter, index) => {
              const previous = data.chapters[index - 1];
              const followsOn = chapter.arc === 'MAIN' && previous?.arc === 'MAIN';
              return (
                <tr key={chapter.key}>
                  <td className="se-td--title">
                    <strong>{chapter.title}</strong>
                    <br />
                    <span className="se-muted">{chapter.chapter}</span>
                  </td>
                  <td className="se-table__number se-num" data-label="Available">{formatNumber(chapter.available)}</td>
                  <td className="se-table__number se-num" data-label="Active">{formatNumber(chapter.active)}</td>
                  <td className="se-table__number se-num" data-label="Ready">{formatNumber(chapter.ready)}</td>
                  <td className="se-table__number se-num" data-label="Completed">{formatNumber(chapter.completed)}</td>
                  <td className="se-table__number se-num" data-label="Kept going">
                    {followsOn ? percent(chapter.completed, previous.completed) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="se-admin-pad">
        <h3>Choices</h3>
        {data.choices.map((choice) => {
          const total = choice.branches.reduce((sum, branch) => sum + branch.count, 0);
          return (
            <p key={choice.questKey}>
              <strong>{choice.title}</strong>
              {': '}
              {choice.branches.map((branch) => `${branch.title} ${formatNumber(branch.count)} (${percent(branch.count, total)})`).join(' · ')}
            </p>
          );
        })}
        <h3>Scene answers</h3>
        {data.scenes.map((scene) => {
          const total = scene.responses.reduce((sum, response) => sum + response.count, 0);
          return (
            <p key={`${scene.questKey}/${scene.sceneKey}`}>
              <strong>{scene.title}</strong>
              <span className="se-muted"> ({formatNumber(total)})</span>
              {': '}
              {scene.responses.map((response) => `${response.label} ${percent(response.count, total)}`).join(' · ')}
            </p>
          );
        })}
      </div>
    </Panel>
  );
}
