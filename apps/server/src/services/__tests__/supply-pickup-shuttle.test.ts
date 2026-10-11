import { describe, expect, it } from 'vitest';
import { planSupplyRun } from '@streets/rules-engine';
import { classicOgV16C } from '@streets/rulesets';
import { repeatSupplyRunPlan } from '../supply-pickup.service.js';

describe('continuous supply pickup routes', () => {
  const now = new Date('2026-10-11T12:00:00Z');

  it('repeats the same fleet route until every supplier load is delivered', () => {
    const single = planSupplyRun(classicOgV16C, {
      home: 'new-york-city',
      origin: 'detroit',
      destination: 'new-york-city',
      routeIndex: 0,
      now,
    });
    const shuttle = repeatSupplyRunPlan(single, 3);

    expect(shuttle.stops.map((stop) => stop.city)).toEqual([
      'detroit', 'new-york-city',
      'detroit', 'new-york-city',
      'detroit', 'new-york-city',
    ]);
    expect(shuttle.loadStops).toEqual([0, 2, 4]);
    expect(shuttle.unloadStops).toEqual([1, 3, 5]);
    expect(shuttle.turns).toBe(single.turns * 3);
    expect(shuttle.stops[1]!.leaveAt).toEqual(shuttle.stops[1]!.arriveAt);
    expect(shuttle.stops[2]!.departAt).toEqual(shuttle.stops[1]!.arriveAt);
  });

  it('reloads at each home turnaround when the supplier is at home', () => {
    const single = planSupplyRun(classicOgV16C, {
      home: 'detroit',
      origin: 'detroit',
      destination: 'atlanta',
      routeIndex: 0,
      now,
    });
    const shuttle = repeatSupplyRunPlan(single, 3);

    expect(shuttle.loadStops).toEqual([-1, 1, 3]);
    expect(shuttle.unloadStops).toEqual([0, 2, 4]);
  });

  it('loads and unloads each trip at the same away-city warehouse', () => {
    const single = planSupplyRun(classicOgV16C, {
      home: 'new-york-city',
      origin: 'detroit',
      destination: 'detroit',
      routeIndex: 0,
      now,
    });
    const shuttle = repeatSupplyRunPlan(single, 2);

    expect(shuttle.loadStops).toEqual([0, 2]);
    expect(shuttle.unloadStops).toEqual([0, 2]);
  });
});
