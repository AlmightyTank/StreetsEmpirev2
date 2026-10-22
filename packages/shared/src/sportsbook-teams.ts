import type { SportsbookLeagueKey } from './types/sportsbook.js';

export interface SportsbookTeamIdentity {
  name: string;
  aliases: readonly string[];
}

const team = (name: string, ...aliases: string[]): SportsbookTeamIdentity => ({ name, aliases });

/**
 * Canonical team identities used to join provider listings. Aliases include abbreviations,
 * city/mascot forms and recent franchise names; ambiguous city-only aliases intentionally resolve
 * to no team.
 */
export const SPORTSBOOK_TEAMS: Record<SportsbookLeagueKey, Record<string, SportsbookTeamIdentity>> = {
  NFL: {
    ARI: team('Arizona Cardinals', 'ARI', 'Arizona', 'Cardinals', 'Phoenix Cardinals'),
    ATL: team('Atlanta Falcons', 'ATL', 'Atlanta', 'Falcons'),
    BAL: team('Baltimore Ravens', 'BAL', 'Baltimore', 'Ravens'),
    BUF: team('Buffalo Bills', 'BUF', 'Buffalo', 'Bills'),
    CAR: team('Carolina Panthers', 'CAR', 'Carolina', 'Panthers'),
    CHI: team('Chicago Bears', 'CHI', 'Chicago', 'Bears'),
    CIN: team('Cincinnati Bengals', 'CIN', 'Cincinnati', 'Bengals'),
    CLE: team('Cleveland Browns', 'CLE', 'Cleveland', 'Browns'),
    DAL: team('Dallas Cowboys', 'DAL', 'Dallas', 'Cowboys'),
    DEN: team('Denver Broncos', 'DEN', 'Denver', 'Broncos'),
    DET: team('Detroit Lions', 'DET', 'Detroit', 'Lions'),
    GB: team('Green Bay Packers', 'GB', 'GNB', 'Green Bay', 'Packers'),
    HOU: team('Houston Texans', 'HOU', 'Houston', 'Texans'),
    IND: team('Indianapolis Colts', 'IND', 'Indianapolis', 'Colts', 'Baltimore Colts'),
    JAX: team('Jacksonville Jaguars', 'JAX', 'JAC', 'Jacksonville', 'Jaguars'),
    KC: team('Kansas City Chiefs', 'KC', 'KAN', 'Kansas City', 'Chiefs'),
    LV: team('Las Vegas Raiders', 'LV', 'LVR', 'Las Vegas', 'Raiders', 'Oakland Raiders', 'OAK Raiders'),
    LAC: team('Los Angeles Chargers', 'LAC', 'LA Chargers', 'Chargers', 'San Diego Chargers', 'SD Chargers'),
    LAR: team('Los Angeles Rams', 'LAR', 'LA Rams', 'Rams', 'St. Louis Rams', 'Saint Louis Rams'),
    MIA: team('Miami Dolphins', 'MIA', 'Miami', 'Dolphins'),
    MIN: team('Minnesota Vikings', 'MIN', 'Minnesota', 'Vikings'),
    NE: team('New England Patriots', 'NE', 'NWE', 'New England', 'Patriots'),
    NO: team('New Orleans Saints', 'NO', 'NOR', 'New Orleans', 'Saints'),
    NYG: team('New York Giants', 'NYG', 'NY Giants', 'Giants'),
    NYJ: team('New York Jets', 'NYJ', 'NY Jets', 'Jets'),
    PHI: team('Philadelphia Eagles', 'PHI', 'Philadelphia', 'Eagles'),
    PIT: team('Pittsburgh Steelers', 'PIT', 'Pittsburgh', 'Steelers'),
    SEA: team('Seattle Seahawks', 'SEA', 'Seattle', 'Seahawks'),
    SF: team('San Francisco 49ers', 'SF', 'SFO', 'San Francisco', '49ers', 'Niners'),
    TB: team('Tampa Bay Buccaneers', 'TB', 'TAM', 'Tampa Bay', 'Buccaneers', 'Bucs'),
    TEN: team('Tennessee Titans', 'TEN', 'Tennessee', 'Titans', 'Houston Oilers', 'Tennessee Oilers'),
    WAS: team('Washington Commanders', 'WAS', 'WSH', 'Washington', 'Commanders', 'Washington Football Team', 'Washington Redskins'),
  },
  NBA: {
    ATL: team('Atlanta Hawks', 'ATL', 'Atlanta', 'Hawks'),
    BOS: team('Boston Celtics', 'BOS', 'Boston', 'Celtics'),
    BKN: team('Brooklyn Nets', 'BKN', 'BRK', 'Brooklyn', 'Nets', 'New Jersey Nets', 'NJ Nets'),
    CHA: team('Charlotte Hornets', 'CHA', 'Charlotte', 'Hornets', 'Charlotte Bobcats'),
    CHI: team('Chicago Bulls', 'CHI', 'Chicago', 'Bulls'),
    CLE: team('Cleveland Cavaliers', 'CLE', 'Cleveland', 'Cavaliers', 'Cavs'),
    DAL: team('Dallas Mavericks', 'DAL', 'Dallas', 'Mavericks', 'Mavs'),
    DEN: team('Denver Nuggets', 'DEN', 'Denver', 'Nuggets'),
    DET: team('Detroit Pistons', 'DET', 'Detroit', 'Pistons'),
    GSW: team('Golden State Warriors', 'GSW', 'Golden State', 'Warriors'),
    HOU: team('Houston Rockets', 'HOU', 'Houston', 'Rockets'),
    IND: team('Indiana Pacers', 'IND', 'Indiana', 'Pacers'),
    LAC: team('Los Angeles Clippers', 'LAC', 'LA Clippers', 'Clippers', 'San Diego Clippers'),
    LAL: team('Los Angeles Lakers', 'LAL', 'LA Lakers', 'Lakers'),
    MEM: team('Memphis Grizzlies', 'MEM', 'Memphis', 'Grizzlies', 'Vancouver Grizzlies'),
    MIA: team('Miami Heat', 'MIA', 'Miami', 'Heat'),
    MIL: team('Milwaukee Bucks', 'MIL', 'Milwaukee', 'Bucks'),
    MIN: team('Minnesota Timberwolves', 'MIN', 'Minnesota', 'Timberwolves', 'Wolves'),
    NOP: team('New Orleans Pelicans', 'NOP', 'NO Pelicans', 'New Orleans', 'Pelicans', 'New Orleans Hornets'),
    NYK: team('New York Knicks', 'NYK', 'NY Knicks', 'Knicks'),
    OKC: team('Oklahoma City Thunder', 'OKC', 'Oklahoma City', 'Thunder', 'Seattle SuperSonics', 'Seattle Supersonics'),
    ORL: team('Orlando Magic', 'ORL', 'Orlando', 'Magic'),
    PHI: team('Philadelphia 76ers', 'PHI', 'Philadelphia', '76ers', 'Sixers'),
    PHX: team('Phoenix Suns', 'PHX', 'Phoenix', 'Suns'),
    POR: team('Portland Trail Blazers', 'POR', 'Portland', 'Trail Blazers', 'Blazers'),
    SAC: team('Sacramento Kings', 'SAC', 'Sacramento', 'Kings'),
    SAS: team('San Antonio Spurs', 'SAS', 'San Antonio', 'Spurs'),
    TOR: team('Toronto Raptors', 'TOR', 'Toronto', 'Raptors'),
    UTA: team('Utah Jazz', 'UTA', 'Utah', 'Jazz'),
    WAS: team('Washington Wizards', 'WAS', 'WSH', 'Washington', 'Wizards', 'Washington Bullets'),
  },
  MLB: {
    ARI: team('Arizona Diamondbacks', 'ARI', 'Arizona', 'Diamondbacks', 'D-backs', 'Dbacks'),
    ATH: team('Athletics', 'ATH', 'OAK', 'Athletics', 'Oakland Athletics', 'Sacramento Athletics', "A's"),
    ATL: team('Atlanta Braves', 'ATL', 'Atlanta', 'Braves'),
    BAL: team('Baltimore Orioles', 'BAL', 'Baltimore', 'Orioles', 'O’s', "O's"),
    BOS: team('Boston Red Sox', 'BOS', 'Boston', 'Red Sox'),
    CHC: team('Chicago Cubs', 'CHC', 'CHI Cubs', 'Cubs'),
    CWS: team('Chicago White Sox', 'CWS', 'CHW', 'CHI White Sox', 'White Sox'),
    CIN: team('Cincinnati Reds', 'CIN', 'Cincinnati', 'Reds'),
    CLE: team('Cleveland Guardians', 'CLE', 'Cleveland', 'Guardians', 'Cleveland Indians'),
    COL: team('Colorado Rockies', 'COL', 'Colorado', 'Rockies'),
    DET: team('Detroit Tigers', 'DET', 'Detroit', 'Tigers'),
    HOU: team('Houston Astros', 'HOU', 'Houston', 'Astros'),
    KC: team('Kansas City Royals', 'KC', 'KCR', 'Kansas City', 'Royals'),
    LAA: team('Los Angeles Angels', 'LAA', 'LA Angels', 'Angels', 'Anaheim Angels', 'Los Angeles Angels of Anaheim'),
    LAD: team('Los Angeles Dodgers', 'LAD', 'LA Dodgers', 'Dodgers'),
    MIA: team('Miami Marlins', 'MIA', 'Miami', 'Marlins', 'Florida Marlins'),
    MIL: team('Milwaukee Brewers', 'MIL', 'Milwaukee', 'Brewers'),
    MIN: team('Minnesota Twins', 'MIN', 'Minnesota', 'Twins'),
    NYM: team('New York Mets', 'NYM', 'NY Mets', 'Mets'),
    NYY: team('New York Yankees', 'NYY', 'NY Yankees', 'Yankees'),
    PHI: team('Philadelphia Phillies', 'PHI', 'Philadelphia', 'Phillies'),
    PIT: team('Pittsburgh Pirates', 'PIT', 'Pittsburgh', 'Pirates'),
    SD: team('San Diego Padres', 'SD', 'SDP', 'San Diego', 'Padres'),
    SEA: team('Seattle Mariners', 'SEA', 'Seattle', 'Mariners'),
    SF: team('San Francisco Giants', 'SF', 'SFG', 'San Francisco', 'SF Giants'),
    STL: team('St. Louis Cardinals', 'STL', 'Saint Louis Cardinals', 'St Louis Cardinals', 'Cardinals'),
    TB: team('Tampa Bay Rays', 'TB', 'TBR', 'Tampa Bay', 'Rays', 'Tampa Bay Devil Rays'),
    TEX: team('Texas Rangers', 'TEX', 'Texas', 'Rangers'),
    TOR: team('Toronto Blue Jays', 'TOR', 'Toronto', 'Blue Jays', 'Jays'),
    WSH: team('Washington Nationals', 'WSH', 'WAS', 'Washington', 'Nationals', 'Nats', 'Montreal Expos'),
  },
  NHL: {
    ANA: team('Anaheim Ducks', 'ANA', 'Anaheim', 'Ducks', 'Mighty Ducks of Anaheim'),
    BOS: team('Boston Bruins', 'BOS', 'Boston', 'Bruins'),
    BUF: team('Buffalo Sabres', 'BUF', 'Buffalo', 'Sabres'),
    CAR: team('Carolina Hurricanes', 'CAR', 'Carolina', 'Hurricanes', 'Canes', 'Hartford Whalers'),
    CBJ: team('Columbus Blue Jackets', 'CBJ', 'Columbus', 'Blue Jackets'),
    CGY: team('Calgary Flames', 'CGY', 'Calgary', 'Flames'),
    CHI: team('Chicago Blackhawks', 'CHI', 'Chicago', 'Blackhawks'),
    COL: team('Colorado Avalanche', 'COL', 'Colorado', 'Avalanche', 'Avs', 'Quebec Nordiques'),
    DAL: team('Dallas Stars', 'DAL', 'Dallas', 'Stars', 'Minnesota North Stars'),
    DET: team('Detroit Red Wings', 'DET', 'Detroit', 'Red Wings'),
    EDM: team('Edmonton Oilers', 'EDM', 'Edmonton', 'Oilers'),
    FLA: team('Florida Panthers', 'FLA', 'Florida', 'Panthers'),
    LAK: team('Los Angeles Kings', 'LAK', 'LA Kings', 'Kings'),
    MIN: team('Minnesota Wild', 'MIN', 'Minnesota', 'Wild'),
    MTL: team('Montreal Canadiens', 'MTL', 'MON', 'Montreal', 'Canadiens', 'Habs'),
    NJD: team('New Jersey Devils', 'NJD', 'NJ Devils', 'Devils'),
    NSH: team('Nashville Predators', 'NSH', 'Nashville', 'Predators', 'Preds'),
    NYI: team('New York Islanders', 'NYI', 'NY Islanders', 'Islanders'),
    NYR: team('New York Rangers', 'NYR', 'NY Rangers', 'Rangers'),
    OTT: team('Ottawa Senators', 'OTT', 'Ottawa', 'Senators', 'Sens'),
    PHI: team('Philadelphia Flyers', 'PHI', 'Philadelphia', 'Flyers'),
    PIT: team('Pittsburgh Penguins', 'PIT', 'Pittsburgh', 'Penguins', 'Pens'),
    SEA: team('Seattle Kraken', 'SEA', 'Seattle', 'Kraken'),
    SJS: team('San Jose Sharks', 'SJS', 'SJ Sharks', 'San Jose', 'Sharks'),
    STL: team('St. Louis Blues', 'STL', 'Saint Louis Blues', 'St Louis Blues', 'Blues'),
    TBL: team('Tampa Bay Lightning', 'TBL', 'TB Lightning', 'Tampa Bay', 'Lightning', 'Bolts'),
    TOR: team('Toronto Maple Leafs', 'TOR', 'Toronto', 'Maple Leafs', 'Leafs'),
    UTA: team('Utah Mammoth', 'UTA', 'Utah', 'Mammoth', 'Utah Hockey Club', 'Arizona Coyotes', 'Phoenix Coyotes'),
    VAN: team('Vancouver Canucks', 'VAN', 'Vancouver', 'Canucks'),
    VGK: team('Vegas Golden Knights', 'VGK', 'Vegas', 'Golden Knights', 'Knights'),
    WPG: team('Winnipeg Jets', 'WPG', 'Winnipeg', 'Jets', 'Atlanta Thrashers'),
    WSH: team('Washington Capitals', 'WSH', 'WAS', 'Washington', 'Capitals', 'Caps'),
  },
  SOFTBALL: {
    UCLA: team('UCLA Bruins', 'UCLA', 'Los Angeles', 'Bruins'),
    OU: team('Oklahoma Sooners', 'OU', 'Norman', 'Sooners'),
    FSU: team('Florida State Seminoles', 'FSU', 'Tallahassee', 'Seminoles'),
    TEX: team('Texas Longhorns', 'TEX', 'Austin', 'Longhorns'),
    LSU: team('LSU Tigers', 'LSU', 'Baton Rouge', 'Tigers'),
    TENN: team('Tennessee Volunteers', 'TENN', 'Knoxville', 'Volunteers'),
    STAN: team('Stanford Cardinal', 'STAN', 'Stanford', 'Cardinal'),
    DUKE: team('Duke Blue Devils', 'DUKE', 'Durham', 'Blue Devils'),
  },
  MMA: {
    JONES: team('Jon Jones', 'Jones', 'Jon'),
    ASPINALL: team('Tom Aspinall', 'Aspinall', 'Tom'),
    SHEVCHENKO: team('Valentina Shevchenko', 'Shevchenko', 'Valentina'),
    GRASSO: team('Alexa Grasso', 'Grasso', 'Alexa'),
    PEREIRA: team('Alex Pereira', 'Pereira', 'Alex'),
    ANKALAEV: team('Magomed Ankalaev', 'Ankalaev', 'Magomed'),
    OMALLEY: team('Sean O’Malley', 'O Malley', 'O\'Malley', 'Sean'),
    DVALISHVILI: team('Merab Dvalishvili', 'Dvalishvili', 'Merab'),
  },
};

export function normalizeSportsbookTeamAlias(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

const aliasesByLeague = new Map<SportsbookLeagueKey, Map<string, string | null>>();

function leagueAliases(league: SportsbookLeagueKey): Map<string, string | null> {
  const cached = aliasesByLeague.get(league);
  if (cached) return cached;
  const aliases = new Map<string, string | null>();
  for (const [teamId, identity] of Object.entries(SPORTSBOOK_TEAMS[league])) {
    for (const label of [teamId, identity.name, ...identity.aliases]) {
      const key = normalizeSportsbookTeamAlias(label);
      if (!aliases.has(key)) aliases.set(key, teamId);
      else if (aliases.get(key) !== teamId) aliases.set(key, null);
    }
  }
  aliasesByLeague.set(league, aliases);
  return aliases;
}

/** Null means unknown or ambiguous within the league. */
export function resolveSportsbookTeam(league: SportsbookLeagueKey, label: string): string | null {
  return leagueAliases(league).get(normalizeSportsbookTeamAlias(label)) ?? null;
}

export function sportsbookTeamName(league: SportsbookLeagueKey, teamId: string): string | null {
  return SPORTSBOOK_TEAMS[league][teamId]?.name ?? null;
}

/** Returns data-quality issues for the canonical team registry. */
export function validateSportsbookTeamRegistry(): string[] {
  const issues: string[] = [];
  for (const [league, teams] of Object.entries(SPORTSBOOK_TEAMS) as [SportsbookLeagueKey, typeof SPORTSBOOK_TEAMS[SportsbookLeagueKey]][]) {
    const seen = new Map<string, string>();
    for (const [teamId, identity] of Object.entries(teams)) {
      if (!teamId.trim()) issues.push(`${league}: team ID is empty`);
      if (!identity.name.trim()) issues.push(`${league}/${teamId}: name is empty`);
      const labels = [teamId, identity.name, ...identity.aliases];
      for (const label of labels) {
        const normalized = normalizeSportsbookTeamAlias(label);
        if (!normalized) issues.push(`${league}/${teamId}: empty alias`);
        const previous = seen.get(normalized);
        if (previous && previous !== teamId) issues.push(`${league}: alias "${label}" is shared by ${previous} and ${teamId}`);
        else seen.set(normalized, teamId);
      }
    }
  }
  return issues;
}
