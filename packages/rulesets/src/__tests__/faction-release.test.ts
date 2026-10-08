import { describe, expect, it } from 'vitest';
import { classicOgV14F } from '../classic-og-v1.4-f/index.js';
import { classicOgV14G } from '../classic-og-v1.4-g/index.js';

describe('1.4.0-G faction release ruleset', () => {
  it('pins the release on top of 1.4.0-F without changing play values', () => {
    expect(classicOgV14G.meta).toEqual({ id: 'classic-og-v1.4-g', version: '1.4.0-G', name: 'Classic OG - Faction Release' });
    const { meta: _m, ...release } = classicOgV14G;
    const { meta: _base, ...prior } = classicOgV14F;
    expect(release).toEqual(prior);
  });
});
