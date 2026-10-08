import { pickSponsors } from '@streets/rules-engine';
import { sponsorCandidates, type FactionKey, type QuestDefinition, type Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { FactionService } from './faction.service.js';

/**
 * 1.4.0-C. Sponsored contracts.
 *
 * A board contract's sponsor is chosen when the board deals it to a player and kept on the
 * attempt (`rewardState.sponsor`), so it is shown before acceptance and never changes after,
 * however the player's standing moves. Boards are still B2's shared decks: only the sponsor
 * leans toward factions the player is Known with.
 */

export interface SponsorOffer {
  definition: QuestDefinition;
  /** A city contract's kind (SELL, TRIP, CASINO); its lane comes from that. */
  cityKind?: string | null;
  /** Unique to this board deal, such as the window start; seeds the lean's roll. */
  window: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cityKindOf(rewardState: unknown): string | null {
  const city = record(record(rewardState)?.cityContract);
  if (!city) return null;
  return typeof city.kind === 'string' ? city.kind : 'SELL';
}

/** Sponsors for one board's offers, in order; null where no faction sponsors the work. */
export async function dealSponsors(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  offers: readonly SponsorOffer[],
): Promise<Array<FactionKey | null>> {
  const rules = ruleset.contractSponsors;
  if (!rules || !offers.length) return offers.map(() => null);
  const candidates = offers.map((offer) => sponsorCandidates(ruleset, offer.definition, offer.cityKind));
  const tiers = candidates.some((list) => list.length > 1) ? await FactionService.tiers(db, roundPlayerId, ruleset) : {};
  return pickSponsors(
    offers.map((offer, index) => ({ seed: `${roundPlayerId}:${offer.definition.key}:${offer.window}`, candidates: candidates[index]! })),
    tiers,
    rules.knownLean,
  );
}

/** The `rewardState` fields that record a sponsor, to spread into a new attempt's state. */
export function sponsorState(sponsor: FactionKey | null): { sponsor?: FactionKey } {
  return sponsor ? { sponsor } : {};
}

/**
 * The faction sponsoring an attempt: the one recorded when it was dealt, else (an alliance
 * contract, or a board with one candidate) its only candidate. Null for a Job or unsponsored work.
 */
export function contractSponsor(
  ruleset: Ruleset,
  definition: QuestDefinition | undefined,
  rewardState: unknown,
): FactionKey | null {
  if (!definition) return null;
  const candidates = sponsorCandidates(ruleset, definition, cityKindOf(rewardState));
  if (!candidates.length) return null;
  const stored = record(rewardState)?.sponsor;
  if (typeof stored === 'string' && candidates.includes(stored as FactionKey)) return stored as FactionKey;
  return candidates[0]!;
}
