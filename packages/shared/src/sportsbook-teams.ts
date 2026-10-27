import type { SportsbookLeagueKey } from './types/sportsbook.js';

export interface SportsbookTeamIdentity {
  name: string;
  aliases: readonly string[];
  /** Present for fictional local clubs; real provider identities derive this from aliases. */
  city?: string;
}

const team = (name: string, ...aliases: string[]): SportsbookTeamIdentity => ({ name, aliases });

/**
 * Canonical team identities used to join provider listings. Aliases include abbreviations,
 * city/mascot forms and recent franchise names; ambiguous city-only aliases intentionally resolve
 * to no team.
 */
export const SPORTSBOOK_TEAMS: Record<SportsbookLeagueKey, Record<string, SportsbookTeamIdentity>> = {
  NFL: {
    ATL: team('Atlanta Falcons', 'ATL', 'Atlanta', 'Falcons'),
    CHI: team('Chicago Bears', 'CHI', 'Chicago', 'Bears'),
    DAL: team('Dallas Cowboys', 'DAL', 'Dallas', 'Cowboys'),
    DET: team('Detroit Lions', 'DET', 'Detroit', 'Lions'),
    LV: team('Las Vegas Raiders', 'LV', 'LVR', 'Las Vegas', 'Raiders', 'Oakland Raiders', 'OAK Raiders'),
    LAC: team('Los Angeles Chargers', 'LAC', 'LA Chargers', 'Chargers', 'San Diego Chargers', 'SD Chargers'),
    LAR: team('Los Angeles Rams', 'LAR', 'LA Rams', 'Rams', 'St. Louis Rams', 'Saint Louis Rams'),
    MIA: team('Miami Dolphins', 'MIA', 'Miami', 'Dolphins'),
    NYG: team('New York Giants', 'NYG', 'NY Giants', 'Giants'),
    NYJ: team('New York Jets', 'NYJ', 'NY Jets', 'Jets'),
    SEA: team('Seattle Seahawks', 'SEA', 'Seattle', 'Seahawks'),
    SF: team('San Francisco 49ers', 'SF', 'SFO', 'San Francisco', '49ers', 'Niners'),
    TUL: { name: 'Tulsa Oilers', aliases: ['TUL', 'Tulsa Oilers'], city: 'Tulsa' },
  },
  NBA: {
    ATL: team('Atlanta Hawks', 'ATL', 'Atlanta', 'Hawks'),
    CHI: team('Chicago Bulls', 'CHI', 'Chicago', 'Bulls'),
    DAL: team('Dallas Mavericks', 'DAL', 'Dallas', 'Mavericks', 'Mavs'),
    DET: team('Detroit Pistons', 'DET', 'Detroit', 'Pistons'),
    LAC: team('Los Angeles Clippers', 'LAC', 'LA Clippers', 'Clippers', 'San Diego Clippers'),
    LAL: team('Los Angeles Lakers', 'LAL', 'LA Lakers', 'Lakers'),
    MIA: team('Miami Heat', 'MIA', 'Miami', 'Heat'),
    NYK: team('New York Knicks', 'NYK', 'NY Knicks', 'Knicks'),
    TUL: { name: 'Tulsa Route 66', aliases: ['TUL', 'Tulsa Route 66'], city: 'Tulsa' },
    LVR: { name: 'Las Vegas Aces', aliases: ['LVR', 'Las Vegas Aces'], city: 'Las Vegas' },
  },
  MLB: {
    ATL: team('Atlanta Braves', 'ATL', 'Atlanta', 'Braves'),
    CHC: team('Chicago Cubs', 'CHC', 'CHI Cubs', 'Cubs'),
    CWS: team('Chicago White Sox', 'CWS', 'CHW', 'CHI White Sox', 'White Sox'),
    DET: team('Detroit Tigers', 'DET', 'Detroit', 'Tigers'),
    LAA: team('Los Angeles Angels', 'LAA', 'LA Angels', 'Angels', 'Anaheim Angels', 'Los Angeles Angels of Anaheim'),
    LAD: team('Los Angeles Dodgers', 'LAD', 'LA Dodgers', 'Dodgers'),
    MIA: team('Miami Marlins', 'MIA', 'Miami', 'Marlins', 'Florida Marlins'),
    NYM: team('New York Mets', 'NYM', 'NY Mets', 'Mets'),
    NYY: team('New York Yankees', 'NYY', 'NY Yankees', 'Yankees'),
    SEA: team('Seattle Mariners', 'SEA', 'Seattle', 'Mariners'),
    SF: team('San Francisco Giants', 'SF', 'SFG', 'San Francisco', 'SF Giants'),
    TUL: { name: 'Tulsa Drillers', aliases: ['TUL', 'Tulsa Drillers'], city: 'Tulsa' },
    LVR: { name: 'Las Vegas Outlaws', aliases: ['LVR', 'Las Vegas Outlaws'], city: 'Las Vegas' },
  },
  NHL: {
    CHI: team('Chicago Blackhawks', 'CHI', 'Chicago', 'Blackhawks'),
    DAL: team('Dallas Stars', 'DAL', 'Dallas', 'Stars', 'Minnesota North Stars'),
    DET: team('Detroit Red Wings', 'DET', 'Detroit', 'Red Wings'),
    LAK: team('Los Angeles Kings', 'LAK', 'LA Kings', 'Kings'),
    NYI: team('New York Islanders', 'NYI', 'NY Islanders', 'Islanders'),
    NYR: team('New York Rangers', 'NYR', 'NY Rangers', 'Rangers'),
    SEA: team('Seattle Kraken', 'SEA', 'Seattle', 'Kraken'),
    VGK: team('Vegas Golden Knights', 'VGK', 'Vegas', 'Las Vegas', 'Golden Knights', 'Knights'),
    TUL: { name: 'Tulsa Ice Dogs', aliases: ['TUL', 'Tulsa Ice Dogs'], city: 'Tulsa' },
  },
  SOFTBALL: {
    UCLA: team('UCLA Bruins', 'UCLA', 'Los Angeles', 'Bruins'),
    TUL: { name: 'Tulsa Golden Hurricane', aliases: ['TUL', 'Tulsa Golden Hurricane'], city: 'Tulsa' },
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

/** Cities currently reachable in ruleset K; the internal feed must never invent teams elsewhere. */
export const SPORTSBOOK_VISITABLE_CITIES = [
  'New York City', 'Detroit', 'Miami Beach', 'Seattle', 'San Francisco',
  'Las Vegas', 'Los Angeles', 'Atlanta', 'Chicago', 'Tulsa', 'Dallas',
] as const;

function cityKey(value: string): string {
  return value.toLowerCase().replace(/\s+(city|beach)$/i, '').trim();
}

/** Provider-side guard for the canonical K sportsbook registry. MMA is venue-based, not city-team based. */
export function sportsbookTeamIsVisitable(league: SportsbookLeagueKey, teamId: string): boolean {
  if (league === 'MMA') return true;
  const identity = SPORTSBOOK_TEAMS[league][teamId];
  if (!identity) return false;
  return SPORTSBOOK_VISITABLE_CITIES.some((city) => {
    const key = cityKey(city);
    return identity.city?.toLowerCase() === key
      || identity.name.toLowerCase().startsWith(`${key} `)
      || identity.aliases.some((alias) => alias.toLowerCase() === key);
  });
}

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
