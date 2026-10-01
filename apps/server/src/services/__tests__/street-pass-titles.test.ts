import { describe, expect, it } from 'vitest';
import { STREET_PASS_S1_COSMETICS } from '@streets/rulesets';
import { profileTitleForKey } from '../profile-titles.js';

describe('Street Pass profile titles', () => {
  it('reads every season title and badge as named, never "The …"', () => {
    const titles = Object.values(STREET_PASS_S1_COSMETICS).filter((cosmetic) => cosmetic.kind === 'TITLE_BADGE');
    expect(titles.map((cosmetic) => cosmetic.key)).toEqual([
      'street-pass-s1-fresh-face', 'street-pass-s1-made-man', 'street-pass-s1-kingpin', 'street-pass-s1-badge',
    ]);
    for (const cosmetic of titles) expect(profileTitleForKey(cosmetic.key)).toBe(cosmetic.name);
  });
});
