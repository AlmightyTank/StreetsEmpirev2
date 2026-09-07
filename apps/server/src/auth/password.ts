import { hash, verify, type Algorithm } from '@node-rs/argon2';

/**
 * Algorithm.Argon2id. The enum is an ambient const enum, which cannot be read
 * at runtime under verbatimModuleSyntax, so the member value is written out.
 */
const ARGON2ID = 2 as Algorithm;

/**
 * Argon2id with the current OWASP password storage parameters:
 * 19 MiB of memory, two passes, one lane.
 */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  plaintext: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plaintext, OPTIONS);
  } catch {
    // A malformed or truncated hash must read as "wrong password", not a 500.
    return false;
  }
}
