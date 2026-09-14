import { describe, expect, it } from 'vitest';
import { cityChoices, Cooldowns, parsePlayerRef, resolveCity } from '../lookup.js';

const cities = [
  { slug: 'detroit', name: 'Detroit' },
  { slug: 'new-orleans', name: 'New Orleans' },
  { slug: 'orlando', name: 'Orlando' },
];

describe('parsePlayerRef', () => {
  it('reads @mentions as Discord IDs and anything else as a name', () => {
    expect(parsePlayerRef('<@123456789012345678>')).toEqual({ discordId: '123456789012345678' });
    expect(parsePlayerRef(' <@!123456789012345678> ')).toEqual({ discordId: '123456789012345678' });
    expect(parsePlayerRef('  Big Daddy ')).toEqual({ name: 'Big Daddy' });
    expect(parsePlayerRef('<@12>')).toEqual({ name: '<@12>' });
  });

  it('rejects empty and over-long names', () => {
    expect(parsePlayerRef('   ')).toBeNull();
    expect(parsePlayerRef('x'.repeat(41))).toBeNull();
  });
});

describe('resolveCity', () => {
  it('accepts an autocomplete slug or a typed name, ignoring case', () => {
    expect(resolveCity('new-orleans', cities)?.name).toBe('New Orleans');
    expect(resolveCity(' detroit ', cities)?.slug).toBe('detroit');
    expect(resolveCity('ORLANDO', cities)?.slug).toBe('orlando');
    expect(resolveCity('Atlantis', cities)).toBeNull();
  });
});

describe('cityChoices', () => {
  it('lists name prefixes before other matches, within the limit', () => {
    expect(cityChoices('or', cities)).toEqual([
      { name: 'Orlando', value: 'orlando' },
      { name: 'New Orleans', value: 'new-orleans' },
    ]);
    expect(cityChoices('', cities)).toHaveLength(3);
    expect(cityChoices('', cities, 2)).toHaveLength(2);
  });
});

describe('Cooldowns', () => {
  it('allows once per window per key', () => {
    let now = 0;
    const cooldowns = new Cooldowns(60_000, () => now);
    expect(cooldowns.take('a')).toBe(0);
    expect(cooldowns.take('a')).toBe(60);
    expect(cooldowns.take('b')).toBe(0);
    now = 59_001;
    expect(cooldowns.take('a')).toBe(1);
    now = 60_000;
    expect(cooldowns.take('a')).toBe(0);
  });
});
