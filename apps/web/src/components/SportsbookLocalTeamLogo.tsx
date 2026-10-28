import type { SportsbookLeagueKey } from '@streets/shared';

type LocalLogoSpec = { asset: string };

/** Supplied artwork for StreetsEmpire Sport Network's fictional local clubs. */
const LOCAL_LOGOS: Record<string, LocalLogoSpec> = {
  'NFL:TUL': { asset: 'tulsa-oilers.svg' },
  'NBA:TUL': { asset: 'tulsa-route-66.svg' },
  'MLB:TUL': { asset: 'tulsa-drillers.svg' },
  'NHL:TUL': { asset: 'tulsa-ice-dogs.svg' },
  'SOFTBALL:TUL': { asset: 'tulsa-golden-hurricane.svg' },
  'NBA:LVR': { asset: 'las-vegas-aces.svg' },
  'MLB:LVR': { asset: 'las-vegas-outlaws.svg' },
};

export function hasSportsbookLocalTeamLogo(sport: SportsbookLeagueKey, teamId: string): boolean {
  return Boolean(LOCAL_LOGOS[`${sport}:${teamId}`]);
}

export function SportsbookLocalTeamLogo({ sport, teamId }: { sport: SportsbookLeagueKey; teamId: string }) {
  const spec = LOCAL_LOGOS[`${sport}:${teamId}`];
  if (!spec) return null;
  return (
    <img
      className="se-sportsbook-local-logo is-loaded"
      src={`/sportsbook/team-logos/${spec.asset}`}
      alt=""
      width="48"
      height="48"
      decoding="async"
    />
  );
}
