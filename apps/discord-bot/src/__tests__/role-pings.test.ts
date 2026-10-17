import { describe, expect, it } from 'vitest';
import { isPatchNotesPost, roleMention } from '../role-pings.js';

describe('Discord subscriber role mentions', () => {
  it('only allows a single specified role to be mentioned', () => {
    expect(roleMention('123456789012345678')).toEqual({
      content: '<@&123456789012345678>',
      allowedMentions: { parse: [], roles: ['123456789012345678'] },
    });
  });

  it('does not mention anyone when a role is absent', () => {
    expect(roleMention('')).toEqual({ allowedMentions: { parse: [], roles: [] } });
  });

  it('routes patch-note headings to Game Updates, rather than News Updates', () => {
    expect(isPatchNotesPost('Patch notes: October 16, 2026')).toBe(true);
    expect(isPatchNotesPost('PATCH NOTES — release 2.1.0')).toBe(true);
    expect(isPatchNotesPost('Patch notes for 2.2.0')).toBe(true);
    expect(isPatchNotesPost('Patch notes')).toBe(true);
    expect(isPatchNotesPost('Important news: update tomorrow')).toBe(false);
    expect(isPatchNotesPost('Patch notebook')).toBe(false);
  });
});
