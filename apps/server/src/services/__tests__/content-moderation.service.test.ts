import { describe, expect, it } from 'vitest';
import { assertCommunicationContent, containsSevereSlur, maskOrdinaryProfanity, maskSevereSlurs } from '../content-moderation.service.js';

describe('content moderation', () => {
  it('blocks severe slurs before communication is persisted', () => {
    expect(containsSevereSlur('hello, nigger')).toBe(true);
    expect(() => assertCommunicationContent('subject', 'hello, nigger')).toThrow('cannot be sent');
  });

  it('masks ordinary profanity without changing clean text', () => {
    expect(maskOrdinaryProfanity('What the fuck, shit!')).toBe('What the ****, ****!');
    expect(maskOrdinaryProfanity('A clean message')).toBe('A clean message');
  });

  it('keeps severe slurs masked for players who show ordinary profanity', () => {
    expect(maskSevereSlurs('nigger')).toBe('******');
  });
});
