import { runPosition, type Ruleset, type RunStopPlan } from '@streets/rules-engine';

/** A run stop as stored, before it is read as a plan. */
export interface EscortStop {
  city: string;
  route: unknown;
  departAt: Date;
  arriveAt: Date;
  leaveAt: Date | null;
}

function placeName(ruleset: Ruleset, slug: string): string {
  return ruleset.cities?.[slug]?.name ?? slug;
}

function stopPlans(stops: readonly EscortStop[]): RunStopPlan[] {
  return stops.map((stop) => ({
    city: stop.city,
    route: Array.isArray(stop.route) ? stop.route.filter((city): city is string => typeof city === 'string') : [],
    departAt: stop.departAt,
    arriveAt: stop.arriveAt,
    leaveAt: stop.leaveAt,
  }));
}

/** Where the escorts on a run are right now. */
export function escortWhereabouts(ruleset: Ruleset, stops: readonly EscortStop[], now: Date): string {
  const plans = stopPlans(stops);
  if (!plans.length) return 'On a run';
  try {
    const position = runPosition(ruleset, plans, now);
    const city = placeName(ruleset, position.city);
    const from = placeName(ruleset, position.from);
    if (position.phase === 'town') return `On a run in ${city}`;
    if (position.phase === 'road') return from !== city ? `On a run from ${from} to ${city}` : `On a run to ${city}`;
    return 'On a run, back home';
  } catch {
    return 'On a run';
  }
}
