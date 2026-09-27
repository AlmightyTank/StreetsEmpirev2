import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * rc.3. Authenticator-app codes (TOTP, RFC 6238): SHA-1, 6 digits, 30-second steps,
 * which every authenticator app (Google Authenticator, Authy, 1Password, Microsoft
 * Authenticator...) uses by default.
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Codes one step either side of now are accepted, for clocks that drift a little. */
const TOTP_WINDOW = 1;
export const RECOVERY_CODE_COUNT = 10;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 as authenticator apps expect. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * The step a code matches, or null. A step at or before `lastStep` is refused, so a code
 * that was already used (or an older one) cannot be replayed.
 */
export function matchTotp(secret: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const current = totpStep(now);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const step = current + offset;
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, accountName: string, issuer = 'StreetsEmpire'): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ---------- Secrets at rest ---------- */

/**
 * Secrets are stored encrypted (AES-256-GCM), so a copy of the database alone does not
 * give anyone the codes. The key is TWO_FACTOR_KEY; without it, one derived from
 * SESSION_SECRET (development and tests). Changing the key breaks every enrolled app.
 */
function key(): Buffer {
  return createHash('sha256').update(env.TWO_FACTOR_KEY ?? `streets-2fa:${env.SESSION_SECRET}`).digest();
}

export function sealSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join(':');
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(':');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unknown two-factor secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

/* ---------- Recovery codes ---------- */

/** Ten one-use codes like `k7m2-qx9d`, for when the phone is lost. Only their hashes are stored. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(`recovery:${code.trim().toLowerCase().replace(/[\s-]/g, '')}`).digest('hex');
}

export function looksLikeRecoveryCode(code: string): boolean {
  return /^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(code.trim());
}
