/**
 * Easter eggs. Each one pays a permanent account title the first time it is
 * found. Unfound eggs are never listed anywhere: the title only appears among a
 * player's badges once the server has recorded the discovery.
 *
 * Eggs are account-wide rather than ruleset content, so they keep working in
 * every round. The encounters that hide some of them are ruleset content
 * (classic-og-v1.8-m) and map back here through EASTER_EGG_ENCOUNTERS.
 */
export type EasterEggRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface EasterEggDefinition {
  /** Account cosmetic key; also the profile title key. */
  readonly key: string;
  /** Badge name, and the profile title as written. */
  readonly title: string;
  /** What the player did, shown on the badge once found. */
  readonly description: string;
  readonly rarity: EasterEggRarity;
}

export const EASTER_EGGS = {
  KONAMI: {
    key: 'egg-konami',
    title: 'Up Up Down Down',
    description: 'Entered the old code. Thirty lives not included.',
    rarity: 'rare',
  },
  WRONG_TURN: {
    key: 'egg-wrong-turn',
    title: 'Wrong Turn',
    description: 'Got lost on a street that does not exist.',
    rarity: 'common',
  },
  DONT_PANIC: {
    key: 'egg-dont-panic',
    title: 'Don’t Panic',
    description: 'Bet exactly $42 at the casino and won. The answer, apparently.',
    rarity: 'rare',
  },
  LEET: {
    key: 'egg-l33t',
    title: 'l33t',
    description: 'Rolled 1,337 pips at Street Dice in a single round.',
    rarity: 'epic',
  },
  HEISENBERG: {
    key: 'egg-heisenberg',
    title: 'Heisenberg',
    description: 'Cooked a batch at 99.1% purity. Say my name.',
    rarity: 'legendary',
  },
  LITTLE_FRIEND: {
    key: 'egg-little-friend',
    title: 'Little Friend',
    description: 'Won a raid outnumbered more than two to one. Said hello.',
    rarity: 'epic',
  },
  BRIEFCASE: {
    key: 'egg-the-briefcase',
    title: 'The Briefcase',
    description: 'Opened a briefcase that glowed, and never told anybody what was inside.',
    rarity: 'epic',
  },
  THE_OFFER: {
    key: 'egg-the-offer',
    title: 'The Offer',
    description: 'Made a man an offer he could not refuse.',
    rarity: 'epic',
  },
  THE_WHISTLE: {
    key: 'egg-heard-the-whistle',
    title: 'Heard the Whistle',
    description: 'Heard somebody whistling down the block, and got off the corner in time.',
    rarity: 'rare',
  },
  DONT_BLINK: {
    key: 'egg-dont-blink',
    title: 'Don’t Blink',
    description: 'Stared down the statue in the alley and never once looked away.',
    rarity: 'legendary',
  },
  DISPLACED: {
    key: 'egg-displaced',
    title: 'Displaced',
    description: 'Blinked. Woke up somewhere else with old money in your pocket.',
    rarity: 'rare',
  },
  APRIL_FOOL: {
    key: 'egg-april-fool',
    title: 'April Fool',
    description: 'Fell for it on the first of April.',
    rarity: 'uncommon',
  },
  FRIDAY_THE_13TH: {
    key: 'egg-camp-counselor',
    title: 'Camp Counselor',
    description: 'Went out on the street on Friday the 13th. The masks were not for hockey.',
    rarity: 'uncommon',
  },
} as const satisfies Record<string, EasterEggDefinition>;

export type EasterEggId = keyof typeof EASTER_EGGS;
export type EasterEggKey = typeof EASTER_EGGS[EasterEggId]['key'];

export const EASTER_EGG_LIST: readonly EasterEggDefinition[] = Object.values(EASTER_EGGS);

export function easterEggByKey(key: string): EasterEggDefinition | null {
  return EASTER_EGG_LIST.find((egg) => egg.key === key) ?? null;
}

/**
 * Eggs the browser reports. Everything else is detected by the server while it
 * resolves the action, so a client cannot claim it. Date eggs are still checked
 * against the server clock.
 */
export const CLIENT_EASTER_EGG_IDS = ['KONAMI', 'WRONG_TURN', 'APRIL_FOOL', 'FRIDAY_THE_13TH'] as const satisfies readonly EasterEggId[];
export type ClientEasterEggId = typeof CLIENT_EASTER_EGG_IDS[number];

export function isClientEasterEggId(value: string): value is ClientEasterEggId {
  return (CLIENT_EASTER_EGG_IDS as readonly string[]).includes(value);
}

export const KONAMI_CODE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
] as const;

/** Exactly $42, in cents. */
export const DONT_PANIC_WAGER_CENTS = 4_200;
/** Street Dice pips summed over every roll a player makes in one round. */
export const LEET_PIPS = 1_337;
/** Chance a meth cook comes out at 99.1%. */
export const HEISENBERG_CHANCE = 1 / 500;
/** The raid attacker brought at most this share of the defender's thugs. */
export const LITTLE_FRIEND_MAX_ODDS = 0.5;

/**
 * Encounter keys (ruleset 1.8.0-M) and which choice finds which egg. A choice
 * left out finds nothing.
 */
export const EASTER_EGG_ENCOUNTERS: Readonly<Record<string, Readonly<Record<string, EasterEggId>>>> = {
  'egg-the-statue': { 'dont-blink': 'DONT_BLINK', run: 'DISPLACED' },
  'egg-the-briefcase': { open: 'BRIEFCASE' },
  'egg-the-offer': { 'make-the-offer': 'THE_OFFER' },
  'egg-the-whistle': { 'get-off-the-corner': 'THE_WHISTLE' },
};

export function easterEggForEncounterChoice(encounterKey: string, choice: string): EasterEggId | null {
  return EASTER_EGG_ENCOUNTERS[encounterKey]?.[choice] ?? null;
}

/** The statue encounter, which the web client draws differently. */
export const STATUE_ENCOUNTER_KEY = 'egg-the-statue';
/** "Don't blink" only counts this soon after the statue appears. Later, you blinked. */
export const STATUE_STARE_SECONDS = 120;

export type EasterEggDay = 'APRIL_FOOLS' | 'FRIDAY_THE_13TH';

/**
 * Today's joke day, if any, in the given time zone (default: the viewer's).
 * The server passes 'UTC' and allows a day either side for players east and
 * west of it; see easterEggDayNear.
 */
export function easterEggDay(at: Date, timeZone?: string): EasterEggDay | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(at);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  if (month === 4 && day === 1) return 'APRIL_FOOLS';
  if (day === 13 && weekday === 'Fri') return 'FRIDAY_THE_13TH';
  return null;
}

/** Is it this joke day somewhere on Earth (UTC-12 to UTC+14) at this instant? */
export function easterEggDayNear(at: Date, day: EasterEggDay): boolean {
  for (const offsetHours of [-12, 0, 14]) {
    if (easterEggDay(new Date(at.getTime() + offsetHours * 3_600_000), 'UTC') === day) return true;
  }
  return false;
}
