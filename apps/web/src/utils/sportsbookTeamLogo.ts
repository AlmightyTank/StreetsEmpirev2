import type { SportsbookLeagueKey } from '@streets/shared';

/**
 * ESPN's image CDN uses league-specific short team IDs, not the display names
 * returned by odds providers. Match the nickname at the end of the name to
 * support "LA Rams" / "Los Angeles Rams" and other provider city variants.
 *
 * These are display-only lookups: an unknown team returns null, never a
 * guessed URL for another club. Team marks remain owned by their leagues/clubs.
 */
const TEAM_CODES: Record<SportsbookLeagueKey, ReadonlyArray<readonly [string, string]>> = {
  NFL: [
    ['Cardinals', 'ari'], ['Falcons', 'atl'], ['Ravens', 'bal'], ['Bills', 'buf'],
    ['Panthers', 'car'], ['Bears', 'chi'], ['Bengals', 'cin'], ['Browns', 'cle'],
    ['Cowboys', 'dal'], ['Broncos', 'den'], ['Lions', 'det'], ['Packers', 'gb'],
    ['Texans', 'hou'], ['Colts', 'ind'], ['Jaguars', 'jax'], ['Chiefs', 'kc'],
    ['Raiders', 'lv'], ['Chargers', 'lac'], ['Rams', 'lar'], ['Dolphins', 'mia'],
    ['Vikings', 'min'], ['Patriots', 'ne'], ['Saints', 'no'], ['Giants', 'nyg'],
    ['Jets', 'nyj'], ['Eagles', 'phi'], ['Steelers', 'pit'], ['49ers', 'sf'],
    ['Seahawks', 'sea'], ['Buccaneers', 'tb'], ['Titans', 'ten'], ['Commanders', 'wsh'],
  ],
  NBA: [
    ['Hawks', 'atl'], ['Celtics', 'bos'], ['Nets', 'bkn'], ['Hornets', 'cha'],
    ['Bulls', 'chi'], ['Cavaliers', 'cle'], ['Mavericks', 'dal'], ['Nuggets', 'den'],
    ['Pistons', 'det'], ['Warriors', 'gs'], ['Rockets', 'hou'], ['Pacers', 'ind'],
    ['Clippers', 'lac'], ['Lakers', 'lal'], ['Grizzlies', 'mem'], ['Heat', 'mia'],
    ['Bucks', 'mil'], ['Timberwolves', 'min'], ['Pelicans', 'no'], ['Knicks', 'ny'],
    ['Thunder', 'okc'], ['Magic', 'orl'], ['76ers', 'phi'], ['Suns', 'phx'],
    ['Trail Blazers', 'por'], ['Kings', 'sac'], ['Spurs', 'sa'], ['Raptors', 'tor'],
    ['Jazz', 'utah'], ['Wizards', 'wsh'],
  ],
  MLB: [
    ['Diamondbacks', 'ari'], ['Athletics', 'oak'], ['Braves', 'atl'],
    ['Orioles', 'bal'], ['Red Sox', 'bos'], ['Cubs', 'chc'], ['White Sox', 'chw'],
    ['Reds', 'cin'], ['Guardians', 'cle'], ['Rockies', 'col'], ['Tigers', 'det'],
    ['Astros', 'hou'], ['Royals', 'kc'], ['Angels', 'laa'], ['Dodgers', 'lad'],
    ['Marlins', 'mia'], ['Brewers', 'mil'], ['Twins', 'min'], ['Mets', 'nym'],
    ['Yankees', 'nyy'], ['Phillies', 'phi'], ['Pirates', 'pit'], ['Padres', 'sd'],
    ['Giants', 'sf'], ['Mariners', 'sea'], ['Cardinals', 'stl'], ['Rays', 'tb'],
    ['Rangers', 'tex'], ['Blue Jays', 'tor'], ['Nationals', 'wsh'],
  ],
  NHL: [
    ['Ducks', 'ana'], ['Bruins', 'bos'], ['Sabres', 'buf'], ['Flames', 'cgy'],
    ['Hurricanes', 'car'], ['Blackhawks', 'chi'], ['Avalanche', 'col'],
    ['Blue Jackets', 'cbj'], ['Stars', 'dal'], ['Red Wings', 'det'],
    ['Oilers', 'edm'], ['Panthers', 'fla'], ['Kings', 'lak'], ['Wild', 'min'],
    ['Canadiens', 'mtl'], ['Predators', 'nsh'], ['Devils', 'nj'],
    ['Islanders', 'nyi'], ['Rangers', 'nyr'], ['Senators', 'ott'],
    ['Flyers', 'phi'], ['Penguins', 'pit'], ['Sharks', 'sj'],
    ['Kraken', 'sea'], ['Blues', 'stl'], ['Lightning', 'tb'],
    ['Maple Leafs', 'tor'], ['Mammoth', 'utah'], ['Hockey Club', 'utah'],
    ['Canucks', 'van'], ['Golden Knights', 'vgk'], ['Capitals', 'wsh'],
    ['Jets', 'wpg'],
  ],
};

const EXTRA_NAMES: Partial<Record<SportsbookLeagueKey, ReadonlyArray<readonly [string, string]>>> = {
  NBA: [['Sixers', 'phi'], ['Trailblazers', 'por']],
  NFL: [['Washington Football Team', 'wsh']],
  NHL: [['Coyotes', 'ari']],
};

function normalizeTeam(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function sportsbookTeamLogoUrl(sport: SportsbookLeagueKey, team: string): string | null {
  const normalized = normalizeTeam(team);
  if (!normalized) return null;
  for (const [name, abbreviation] of [...TEAM_CODES[sport], ...(EXTRA_NAMES[sport] ?? [])]) {
    const suffix = normalizeTeam(name);
    if (normalized === suffix || normalized.endsWith(` ${suffix}`)) {
      return `https://a.espncdn.com/i/teamlogos/${sport.toLowerCase()}/500/scoreboard/${abbreviation}.png`;
    }
  }
  return null;
}
