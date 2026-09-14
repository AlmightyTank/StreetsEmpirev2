import { describe, expect, it } from 'vitest';
import { signForumPayload, verifyForumProof } from '../forum-proof.js';

const secret = 'test-secret-'.repeat(8);
const now = 1_800_000_000_000;
const forum = 'https://forum.example.test';
const game = 'https://game.example.test';
const payload = { v: 1, purpose: 'forum-link-response', iss: forum, aud: game, nonce: 'a'.repeat(64), userId: '123', username: 'Forum Player', iat: now / 1000, exp: now / 1000 + 600 };
const verify = (value: object) => verifyForumProof(signForumPayload(value, secret), secret, forum, game, now);

describe('forum linking proof', () => {
  it('accepts a signed bounded proof with a stable numeric forum ID', () => {
    expect(verify(payload).userId).toBe('123');
  });
  it.each([
    { purpose: 'forum-link-request' }, { iss: game }, { aud: forum }, { exp: now / 1000 },
    { iat: now / 1000 + 60 }, { exp: now / 1000 + 601 }, { userId: '../admin' },
    { userId: '0' }, { username: '' }, { nonce: 'short' }, { extra: 'ignored?' },
  ])('rejects invalid signed claims %j', (change) => {
    expect(() => verify({ ...payload, ...change })).toThrow();
  });
  it('rejects tampering, wrong keys, missing keys, malformed and oversized input', () => {
    const token = signForumPayload(payload, secret);
    for (const broken of ['bad', token + '.extra', 'x'.repeat(4097), token.replace(/^./, 'X')]) {
      expect(() => verifyForumProof(broken, secret, forum, game, now)).toThrow();
    }
    expect(() => verifyForumProof(token, 'wrong', forum, game, now)).toThrow();
    expect(() => verifyForumProof(token, '', forum, game, now)).toThrow();
  });
});
