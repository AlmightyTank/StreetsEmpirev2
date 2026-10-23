import { resolveSportsbookTeam, type SportsbookLeagueKey } from '@streets/shared';

export function sportsbookTeamLogoUrl(sport: SportsbookLeagueKey, team: string): string | null {
  const id = resolveSportsbookTeam(sport, team);
  if (!id) return null;

  // ESPN's CDN uses a few non-standard abbreviations for team logos.
  const espnCodes: Partial<Record<SportsbookLeagueKey, Readonly<Record<string, string>>>> = {
    NFL: { WAS: 'wsh' },
    NBA: { GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah', WAS: 'wsh' },
    MLB: { ATH: 'ath', CWS: 'chw', WSH: 'wsh' },
    NHL: { LAK: 'la', NJD: 'nj', SJS: 'sj', TBL: 'tb', UTA: 'utah', WSH: 'wsh' },
  };
  const code = espnCodes[sport]?.[id] ?? id.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/${sport.toLowerCase()}/500/scoreboard/${code}.png`;
}
