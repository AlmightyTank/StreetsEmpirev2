import { describe, expect, it } from 'vitest';
import { formatProfileName } from '../profile-title.js';

describe('formatProfileName', () => {
  it('renders honorific titles before the name', () => {
    expect(formatProfileName('AMightyTank', 'Sir', 'prefix')).toBe('Sir AMightyTank');
    expect(formatProfileName('Datginger', 'Madam')).toBe('Madam Datginger');
  });

  it('renders earned titles after the name without a redundant article', () => {
    expect(formatProfileName('AMightyTank', 'The Quiet Ghost', 'suffix')).toBe('AMightyTank, Quiet Ghost');
    expect(formatProfileName('Datginger', 'Road Warrior', 'suffix')).toBe('Datginger, Road Warrior');
  });

  it('does not add punctuation when no title is selected', () => {
    expect(formatProfileName('AMightyTank', null, 'suffix')).toBe('AMightyTank');
  });
});
