import { resolveSportsbookTeam, type SportsbookLeagueKey } from '@streets/shared';

/**
 * The sportsbook already has a canonical four-league team registry with
 * provider-name aliases. Reuse that exact resolver instead of fuzzy suffix
 * matching: "New York Giants" must not resolve to the MLB Giants.
 *
 * ESPN's logo CDN mostly uses a lowercase canonical ID; only the differing
 * IDs need to be listed here. Images are display-only and may fail offline.
 */
const ESPN_LOGO_CODES: Partial<Record<SportsbookLeagueKey, Readonly<Record<string, string>>>> = {
  NFL: { WAS: 'wsh' },
  NBA: { GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah', WAS: 'wsh' },
  MLB: { ATH: 'ath', CWS: 'chw', WSH: 'wsh' },
  NHL: { LAK: 'la', NJD: 'nj', SJS: 'sj', TBL: 'tb', UTA: 'utah', WSH: 'wsh' },
};

export function sportsbookTeamLogoUrl(sport: SportsbookLeagueKey, team: string): string | null {
  const id = resolveSportsbookTeam(sport, team);
  if (!id) return null;
  const code = ESPN_LOGO_CODES[sport]?.[id] ?? id.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/${sport.toLowerCase()}/500/scoreboard/${code}.png`;
}
