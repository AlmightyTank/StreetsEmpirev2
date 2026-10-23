import type { SportsbookProviderState } from '@prisma/client';
import type { SportsbookLeagueKey } from '@streets/shared';
import type { ProviderSessionDeps, SportsbookProvider } from './sportsbook-provider.js';
import { INTERNAL_SPORTSBOOK_PROVIDER_ID, InternalSportsbookProvider } from './internal.provider.js';

export const DEFAULT_SPORTSBOOK_PROVIDER_ID = INTERNAL_SPORTSBOOK_PROVIDER_ID;
export const SPORTSBOOK_ODDS_PROVIDER_IDS = [INTERNAL_SPORTSBOOK_PROVIDER_ID] as const;
export const SPORTSBOOK_PROVIDER_IDS = [INTERNAL_SPORTSBOOK_PROVIDER_ID] as const;
/** Legacy IDs remain part of the type surface for old admin records and migrations. */
export type SportsbookProviderId = typeof SPORTSBOOK_PROVIDER_IDS[number] | 'therundown' | 'theoddsapi' | 'espn';
export type SportsbookProviderKeys = Partial<Record<SportsbookProviderId, string>>;

/** Server-owned provider priority. Gameplay rulesets deliberately do not choose vendors. */
export const SPORTSBOOK_ODDS_CHAINS: Record<SportsbookLeagueKey, readonly SportsbookProviderId[]> = {
  NFL: [INTERNAL_SPORTSBOOK_PROVIDER_ID], NBA: [INTERNAL_SPORTSBOOK_PROVIDER_ID],
  MLB: [INTERNAL_SPORTSBOOK_PROVIDER_ID], NHL: [INTERNAL_SPORTSBOOK_PROVIDER_ID],
  SOFTBALL: [INTERNAL_SPORTSBOOK_PROVIDER_ID], MMA: [INTERNAL_SPORTSBOOK_PROVIDER_ID],
};

export const SPORTSBOOK_RESULT_CHAINS: Record<SportsbookLeagueKey, readonly SportsbookProviderId[]> = {
  NFL: [INTERNAL_SPORTSBOOK_PROVIDER_ID], NBA: [INTERNAL_SPORTSBOOK_PROVIDER_ID],
  MLB: [INTERNAL_SPORTSBOOK_PROVIDER_ID], NHL: [INTERNAL_SPORTSBOOK_PROVIDER_ID],
  SOFTBALL: [INTERNAL_SPORTSBOOK_PROVIDER_ID], MMA: [INTERNAL_SPORTSBOOK_PROVIDER_ID],
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
  return new InternalSportsbookProvider(now);
}
