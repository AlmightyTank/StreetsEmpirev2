import { describe, expect, it, vi } from 'vitest';
import { classicOgV08H } from '@streets/rulesets';
import { tourProgress } from '../onboarding.service.js';

const noActivity = {
  quested: false,
  scouted: false,
  recruited: false,
  hired: false,
  condoms: false,
  beer: false,
  produced: false,
  hideout: false,
  raided: false,
};

function prismaWith(row: typeof noActivity) {
  return { $queryRaw: vi.fn().mockResolvedValue([row]) };
}

describe('street-sign tutorial evidence', () => {
  it('counts an already-saved valid sign without requiring a client completion action', async () => {
    const progress = await tourProgress(prismaWith(noActivity), { id: 'player-1', thugs: 0 }, classicOgV08H, true);
    expect(progress['build-street-sign']).toBe(true);
  });

  it('does not complete for an empty design and preserves already-graduated seven-step tours', async () => {
    const missing = await tourProgress(prismaWith(noActivity), { id: 'player-1', thugs: 0 }, classicOgV08H, false);
    expect(missing['build-street-sign']).toBe(false);

    const legacyGraduated = await tourProgress(prismaWith({
      quested: true, scouted: true, recruited: true, hired: false, condoms: true, beer: true,
      produced: true, hideout: true, raided: true,
    }), { id: 'player-1', thugs: 0 }, classicOgV08H, false);
    expect(legacyGraduated['build-street-sign']).toBe(true);
  });
});
