import type { SportsbookProviderState } from '@prisma/client';
import { SPORTSBOOK_QUOTA_ODDS_FLOOR, SPORTSBOOK_QUOTA_RESULTS_FLOOR, type SportsbookLeagueKey } from '@streets/shared';
import type { ProviderSessionDeps, SportsbookProvider } from './sportsbook-provider.js';
import { THE_ODDS_API_PROVIDER_ID, TheOddsApiProvider } from './the-odds-api.provider.js';
import { THERUNDOWN_PROVIDER_ID, TheRundownProvider } from './therundown.provider.js';
import { ESPN_PROVIDER_ID, EspnProvider } from './espn.provider.js';

export const DEFAULT_SPORTSBOOK_PROVIDER_ID = THERUNDOWN_PROVIDER_ID;
export const SPORTSBOOK_ODDS_PROVIDER_IDS = [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID] as const;
export const SPORTSBOOK_PROVIDER_IDS = [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID, ESPN_PROVIDER_ID] as const;
export type SportsbookProviderId = typeof SPORTSBOOK_PROVIDER_IDS[number];
export type SportsbookProviderKeys = Partial<Record<SportsbookProviderId, string>>;

/** Server-owned provider priority. Gameplay rulesets deliberately do not choose vendors. */
export const SPORTSBOOK_ODDS_CHAINS: Record<SportsbookLeagueKey, readonly SportsbookProviderId[]> = {
  NFL: [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID],
  NBA: [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID],
  MLB: [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID],
  NHL: [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID],
};

export const SPORTSBOOK_RESULT_CHAINS: Record<SportsbookLeagueKey, readonly SportsbookProviderId[]> = {
  NFL: [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID, ESPN_PROVIDER_ID],
  NBA: [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID, ESPN_PROVIDER_ID],
  MLB: [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID, ESPN_PROVIDER_ID],
  NHL: [THERUNDOWN_PROVIDER_ID, THE_ODDS_API_PROVIDER_ID, ESPN_PROVIDER_ID],
};

/** Vendor billing units differ: TheRundown has 20k daily points; The Odds API starts at 500 monthly credits. */
export const SPORTSBOOK_PROVIDER_QUOTA_FLOORS: Record<SportsbookProviderId, { odds: number; results: number }> = {
  [THERUNDOWN_PROVIDER_ID]: { odds: SPORTSBOOK_QUOTA_ODDS_FLOOR, results: SPORTSBOOK_QUOTA_RESULTS_FLOOR },
  [THE_ODDS_API_PROVIDER_ID]: { odds: 25, results: 5 },
  [ESPN_PROVIDER_ID]: { odds: 0, results: 0 },
};

export const sportsbookProviderName = (id: string): string => id === THERUNDOWN_PROVIDER_ID
  ? 'TheRundown'
  : id === THE_ODDS_API_PROVIDER_ID
    ? 'The Odds API'
    : id === ESPN_PROVIDER_ID
      ? 'ESPN scoreboard'
    : id;

export function createSportsbookProvider(
  id: SportsbookProviderId,
  apiKey: string,
  state: SportsbookProviderState,
  now: Date,
  deps: ProviderSessionDeps = {},
): SportsbookProvider {
  if (id === ESPN_PROVIDER_ID) return EspnProvider.fromState(state, now, deps);
  if (id === THE_ODDS_API_PROVIDER_ID) return TheOddsApiProvider.fromState(apiKey, state, now, deps);
  return TheRundownProvider.fromState(apiKey, state, now, deps);
}
