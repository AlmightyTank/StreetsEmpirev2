import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

export const FORUM_LINK_TTL_SECONDS = 600;
export const forumUserIdSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);
const proofSchema = z.object({
  v: z.literal(1),
  purpose: z.literal('forum-link-response'),
  iss: z.string(),
  aud: z.string(),
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
  userId: forumUserIdSchema,
  username: z.string().min(1).max(100),
  iat: z.number().int(),
  exp: z.number().int(),
}).strict();

export function invalidForumProof(): AppError {
  return AppError.badRequest('FORUM_LINK_INVALID', 'This forum link has expired or is no longer valid. Start again from your account settings.');
}

export function hashForumNonce(nonce: string): string {
  return createHash('sha256').update(nonce).digest('hex');
}

/** Fixed HMAC-SHA256 protocol; no algorithm supplied by the caller. */
export function signForumPayload(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
}

export function verifyForumProof(token: string, secret: string, forumOrigin: string, gameOrigin: string, now = Date.now()) {
  if (!secret || token.length > 4096) throw invalidForumProof();
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]!)) throw invalidForumProof();
  const expected = createHmac('sha256', secret).update(parts[0]!).digest();
  const signature = Buffer.from(parts[1]!, 'base64url');
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw invalidForumProof();
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')); } catch { throw invalidForumProof(); }
  const result = proofSchema.safeParse(decoded);
  if (!result.success) throw invalidForumProof();
  const proof = result.data;
  const seconds = Math.floor(now / 1000);
  if (proof.iss !== forumOrigin || proof.aud !== gameOrigin || proof.exp <= seconds || proof.iat > seconds + 30 || proof.exp <= proof.iat || proof.exp - proof.iat > FORUM_LINK_TTL_SECONDS) throw invalidForumProof();
  return proof;
}
