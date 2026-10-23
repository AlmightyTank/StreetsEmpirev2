import { useState } from 'react';
import type { SportsbookLeagueKey } from '@streets/shared';
import { sportsbookTeamName, resolveSportsbookTeam } from '@streets/shared';
import { sportsbookTeamLogoUrl } from '../utils/sportsbookTeamLogo.js';

/** Decorative team mark; the adjacent ticket text always names the pick. */
export function SportsbookTeamLogo({ sport, team }: { sport: SportsbookLeagueKey; team: string }) {
  const url = sportsbookTeamLogoUrl(sport, team);
  const teamId = resolveSportsbookTeam(sport, team);
  const canonicalName = teamId ? sportsbookTeamName(sport, teamId) : null;
  const fallback = (canonicalName ?? team).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || sport;
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <span className="se-sportsbook__ticket-mark" aria-hidden="true">
      <span className="se-sportsbook__ticket-fallback">{fallback}</span>
      {url && failedUrl !== url ? (
        <img
          key={url}
          src={url}
          alt=""
          width="40"
          height="40"
          loading="lazy"
          decoding="async"
          className={loadedUrl === url ? 'is-loaded' : ''}
          onLoad={() => setLoadedUrl(url)}
          onError={() => setFailedUrl(url)}
        />
      ) : null}
    </span>
  );
}
