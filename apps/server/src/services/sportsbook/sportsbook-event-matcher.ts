import {
  resolveSportsbookTeam,
  sportsbookTeamName,
  type SportsbookLeagueKey,
} from '@streets/shared';
import type { NormalizedSportsbookEvent } from './sportsbook-provider.js';

export const SPORTSBOOK_EVENT_MATCH_WINDOW_MS = 3 * 60 * 60_000;

export type CanonicalSportsbookEventCandidate = {
  id: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: Date;
};

export type ResolvedSportsbookTeams = {
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: string;
  awayTeam: string;
};

export type SportsbookEventMatch =
  | { kind: 'MATCHED'; event: CanonicalSportsbookEventCandidate; teams: ResolvedSportsbookTeams }
  | { kind: 'NO_MATCH'; teams: ResolvedSportsbookTeams }
  | { kind: 'UNKNOWN_TEAM'; homeTeam: string; awayTeam: string }
  | { kind: 'AMBIGUOUS'; candidateIds: string[]; teams: ResolvedSportsbookTeams };

export function resolveSportsbookListingTeams(
  league: SportsbookLeagueKey,
  homeTeam: string,
  awayTeam: string,
): ResolvedSportsbookTeams | null {
  const homeTeamId = resolveSportsbookTeam(league, homeTeam);
  const awayTeamId = resolveSportsbookTeam(league, awayTeam);
  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return null;
  return {
    homeTeamId,
    awayTeamId,
    homeTeam: sportsbookTeamName(league, homeTeamId)!,
    awayTeam: sportsbookTeamName(league, awayTeamId)!,
  };
}

/** Match by league, resolved home/away identities and start time; equal nearest games are unsafe. */
export function matchSportsbookEvent(
  listing: NormalizedSportsbookEvent,
  candidates: readonly CanonicalSportsbookEventCandidate[],
): SportsbookEventMatch {
  const teams = resolveSportsbookListingTeams(listing.league, listing.homeTeam, listing.awayTeam);
  if (!teams) return { kind: 'UNKNOWN_TEAM', homeTeam: listing.homeTeam, awayTeam: listing.awayTeam };

  const matches = candidates
    .filter((candidate) => candidate.sport === listing.league)
    .map((candidate) => ({
      candidate,
      difference: Math.abs(candidate.startsAt.getTime() - listing.startsAt.getTime()),
      teams: resolveSportsbookListingTeams(listing.league, candidate.homeTeam, candidate.awayTeam),
    }))
    .filter((row) => row.difference <= SPORTSBOOK_EVENT_MATCH_WINDOW_MS
      && row.teams?.homeTeamId === teams.homeTeamId
      && row.teams.awayTeamId === teams.awayTeamId)
    .sort((left, right) => left.difference - right.difference);

  if (!matches.length) return { kind: 'NO_MATCH', teams };
  if (matches[1] && matches[1].difference === matches[0]!.difference) {
    return {
      kind: 'AMBIGUOUS',
      candidateIds: matches.filter((row) => row.difference === matches[0]!.difference).map((row) => row.candidate.id),
      teams,
    };
  }
  return { kind: 'MATCHED', event: matches[0]!.candidate, teams };
}
