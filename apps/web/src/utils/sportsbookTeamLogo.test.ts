import { describe, expect, it } from 'vitest';
import { sportsbookTeamLogoUrl } from './sportsbookTeamLogo.js';

describe('sportsbook ticket team logos', () => {
  it('uses the picked team, not the opponent or a league icon', () => {
    expect(sportsbookTeamLogoUrl('NFL', 'Houston Texans'))
      .toBe('https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/hou.png');
    expect(sportsbookTeamLogoUrl('NFL', 'New Orleans Saints'))
      .toBe('https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/no.png');
    expect(sportsbookTeamLogoUrl('NFL', 'Kansas City Chiefs'))
      .toBe('https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/kc.png');
  });

  it('resolves the four leagues with their own team codes', () => {
    expect(sportsbookTeamLogoUrl('NBA', 'LA Lakers')).toContain('/nba/500/scoreboard/lal.png');
    expect(sportsbookTeamLogoUrl('MLB', 'New York Yankees')).toContain('/mlb/500/scoreboard/nyy.png');
    expect(sportsbookTeamLogoUrl('NHL', 'Vegas Golden Knights')).toContain('/nhl/500/scoreboard/vgk.png');
    expect(sportsbookTeamLogoUrl('NHL', 'Utah Mammoth')).toContain('/nhl/500/scoreboard/utah.png');
    expect(sportsbookTeamLogoUrl('NHL', 'Los Angeles Kings')).toContain('/nhl/500/scoreboard/la.png');
  });

  it('supports provider name variants and isolates overlapping nicknames by league', () => {
    expect(sportsbookTeamLogoUrl('NFL', 'NY Giants')).toContain('/nfl/500/scoreboard/nyg.png');
    expect(sportsbookTeamLogoUrl('MLB', 'San Francisco Giants')).toContain('/mlb/500/scoreboard/sf.png');
    expect(sportsbookTeamLogoUrl('MLB', 'Athletics')).toContain('/mlb/500/scoreboard/ath.png');
    expect(sportsbookTeamLogoUrl('NBA', 'Philadelphia Sixers')).toContain('/nba/500/scoreboard/phi.png');
    expect(sportsbookTeamLogoUrl('NHL', 'St. Louis Blues')).toContain('/nhl/500/scoreboard/stl.png');
  });

  it('does not fabricate assets for malformed or unknown teams', () => {
    expect(sportsbookTeamLogoUrl('NFL', 'Somebody Else')).toBeNull();
    expect(sportsbookTeamLogoUrl('NFL', '')).toBeNull();
    expect(sportsbookTeamLogoUrl('MLB', 'New York Giants')).toBeNull();
    expect(sportsbookTeamLogoUrl('NBA', 'Los Angeles Kings')).toBeNull();
    expect(sportsbookTeamLogoUrl('MLB', 'New York Cosmos')).toBeNull();
  });
});
