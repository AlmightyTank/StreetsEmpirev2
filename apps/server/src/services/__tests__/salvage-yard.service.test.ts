import { describe, expect, it } from 'vitest';
import { COMPONENTS } from '../scavenging.service.js';
import { salvagePrice } from '../salvage-yard.service.js';
import { hideoutBuildMinutes } from '../hideout-build.service.js';

describe('salvage yard', () => {
  it('deals in every hideout component', () => {
    for (const component of COMPONENTS) expect(salvagePrice(component.key)).not.toBeNull();
    expect(salvagePrice('NOT_A_PART')).toBeNull();
  });

  it('sells everyday parts for cash and barters the scarce ones', () => {
    for (const component of COMPONENTS) {
      const price = salvagePrice(component.key)!;
      const everyday = component.rarity === 'COMMON' || component.rarity === 'UNCOMMON';
      expect(price.kind).toBe(everyday ? 'CASH' : 'BARTER');
    }
    expect((salvagePrice('SCRAP_METAL') as { cents: number }).cents).toBeLessThan((salvagePrice('RADIO') as { cents: number }).cents);
  });

  it('never asks for a part in trade for itself, and every barter input can be had', () => {
    for (const component of COMPONENTS) {
      const price = salvagePrice(component.key)!;
      if (price.kind !== 'BARTER') continue;
      expect(price.components[component.key]).toBeUndefined();
      for (const input of Object.keys(price.components)) expect(salvagePrice(input)).not.toBeNull();
    }
  });
});

describe('hideout construction time', () => {
  it('keeps room level 1 instant and makes later levels take longer', () => {
    expect(hideoutBuildMinutes('SAFE_ROOM', 1)).toBe(0);
    expect(hideoutBuildMinutes('SAFE_ROOM', 2)).toBeGreaterThan(0);
    expect(hideoutBuildMinutes('WORKSHOP', 3)).toBeGreaterThan(hideoutBuildMinutes('WORKSHOP', 2));
    expect(hideoutBuildMinutes('STORAGE', 1)).toBeGreaterThan(0);
  });
});
