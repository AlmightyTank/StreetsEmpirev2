import { describe, expect, it } from 'vitest';
import { isBuiltInProfileTitle, profileTitleForAward, profileTitleForKey } from '../profile-titles.js';

describe('profile titles', () => {
  it('supports player-selected honorifics without treating arbitrary keys as built-ins', () => {
    expect(profileTitleForKey('honorific-sir')).toBe('Sir');
    expect(profileTitleForKey('honorific-madam')).toBe('Madam');
    expect(isBuiltInProfileTitle('honorific-donna')).toBe(true);
    expect(isBuiltInProfileTitle('honorific-unlocked-admin-title')).toBe(false);
  });

  it('keeps mapped achievement titles and readable fallback labels available to the new nameplate', () => {
    expect(profileTitleForAward({ key: 'block-boss', title: 'Block Boss' })).toBe('Block Boss');
    expect(profileTitleForAward({ key: 'future-title', title: 'Diamond Hustler' })).toBe('The Diamond Hustler');
  });
});
