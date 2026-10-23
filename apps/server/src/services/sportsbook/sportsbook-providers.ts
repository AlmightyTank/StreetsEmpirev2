import type { SportsbookProviderState } from '@prisma/client';
import type { SportsbookLeagueKey } from '@streets/shared';
import type { ProviderSessionDeps, SportsbookProvider } from './sportsbook-provider.js';
import { INTERNAL_SPORTSBOOK_PROVIDER_ID, InternalSportsbookProvider } from './internal.provider.js';
import { TheRundownProvider } from './therundown.provider.js';
import { TheOddsApiProvider } from './the-odds-api.provider.js';
import { EspnProvider } from './espn.provider.js';

export const DEFAULT_SPORTSBOOK_PROVIDER_ID = INTERNAL_SPORTSBOOK_PROVIDER_ID;
export const SPORTSBOOK_ODDS_PROVIDER_IDS = [INTERNAL_SPORTSBOOK_PROVIDER_ID, 'therundown', 'theoddsapi'] as const;
export const SPORTSBOOK_PROVIDER_IDS = [INTERNAL_SPORTSBOOK_PROVIDER_ID, 'therundown', 'theoddsapi', 'espn'] as const;
export type SportsbookProviderId = typeof SPORTSBOOK_PROVIDER_IDS[number];
export type SportsbookProviderKeys = Partial<Record<SportsbookProviderId, string>>;

/** Server-owned provider priority. Gameplay rulesets deliberately do not choose vendors. */
export const SPORTSBOOK_ODDS_CHAINS: Record<SportsbookLeagueKey, readonly SportsbookProviderId[]> = {
  NFL: ['therundown', 'theoddsapi', INTERNAL_SPORTSBOOK_PROVIDER_ID], NBA: ['therundown', 'theoddsapi', INTERNAL_SPORTSBOOK_PROVIDER_ID],
  MLB: ['therundown', 'theoddsapi', INTERNAL_SPORTSBOOK_PROVIDER_ID], NHL: ['therundown', 'theoddsapi', INTERNAL_SPORTSBOOK_PROVIDER_ID],
  SOFTBALL: ['therundown', 'theoddsapi', INTERNAL_SPORTSBOOK_PROVIDER_ID], MMA: ['therundown', 'theoddsapi', INTERNAL_SPORTSBOOK_PROVIDER_ID],
};

export const SPORTSBOOK_RESULT_CHAINS: Record<SportsbookLeagueKey, readonly SportsbookProviderId[]> = {
  NFL: ['therundown', 'theoddsapi', 'espn', INTERNAL_SPORTSBOOK_PROVIDER_ID], NBA: ['therundown', 'theoddsapi', 'espn', INTERNAL_SPORTSBOOK_PROVIDER_ID],
  MLB: ['therundown', 'theoddsapi', 'espn', INTERNAL_SPORTSBOOK_PROVIDER_ID], NHL: ['therundown', 'theoddsapi', 'espn', INTERNAL_SPORTSBOOK_PROVIDER_ID],
  SOFTBALL: ['therundown', 'theoddsapi', 'espn', INTERNAL_SPORTSBOOK_PROVIDER_ID], MMA: ['therundown', 'theoddsapi', 'espn', INTERNAL_SPORTSBOOK_PROVIDER_ID],
};

/** Vendor billing units differ: TheRundown has 20k daily points; The Odds API starts at 500 monthly credits. */
export const SPORTSBOOK_PROVIDER_QUOTA_FLOORS: Record<SportsbookProviderId, { odds: number; results: number }> = {
  [INTERNAL_SPORTSBOOK_PROVIDER_ID]: { odds: 0, results: 0 },
  therundown: { odds: 0, results: 0 },
  theoddsapi: { odds: 0, results: 0 },
  espn: { odds: 0, results: 0 },
};

export const sportsbookProviderName = (id: string): string => id === INTERNAL_SPORTSBOOK_PROVIDER_ID ? 'StreetsEmpire Sports Network' : id;

export function createSportsbookProvider(
  id: SportsbookProviderId,
  apiKey: string,
  state: SportsbookProviderState,
  now: Date,
  deps: ProviderSessionDeps = {},
): SportsbookProvider {
  if (id === 'therundown') return TheRundownProvider.fromState(apiKey, state, now, deps);
  if (id === 'theoddsapi') return TheOddsApiProvider.fromState(apiKey, state, now, deps);
  if (id === 'espn') return EspnProvider.fromState(state, now, deps);
  return new InternalSportsbookProvider(now);
}
