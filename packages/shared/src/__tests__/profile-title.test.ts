import { describe, expect, it } from 'vitest';
import { formatProfileName, profileNameParts } from '../profile-title.js';

describe('formatProfileName', () => {
  it('keeps honorifics before the name regardless of the saved placement', () => {
    expect(formatProfileName('AMightyTank', 'Sir', 'suffix')).toBe('Sir AMightyTank');
    expect(formatProfileName('Datginger', 'Madam')).toBe('Madam Datginger');
  });

  it('renders earned titles as epithets after the name', () => {
    expect(formatProfileName('AMightyTank', 'Fresh Face', 'prefix')).toBe('AMightyTank · Fresh Face');
    expect(formatProfileName('Datginger', 'The Quiet Ghost')).toBe('Datginger · Quiet Ghost');
  });

  it('exposes separately styled name segments', () => {
    expect(profileNameParts('AMightyTank', 'Fresh Face')).toEqual([
      { kind: 'name', text: 'AMightyTank' },
      { kind: 'separator', text: ' · ' },
      { kind: 'title', text: 'Fresh Face' },
    ]);
  });

  it('does not add punctuation when no title is selected', () => {
    expect(formatProfileName('AMightyTank', null, 'suffix')).toBe('AMightyTank');
  });
});
