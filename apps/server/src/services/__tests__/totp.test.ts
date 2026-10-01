import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  matchTotp,
  openSecret,
  otpauthUrl,
  sealSecret,
  totpCode,
} from '../../auth/totp.js';

// RFC 6238 appendix B, SHA-1: the key is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('authenticator codes (rc.3)', () => {
  it('matches the RFC 6238 reference codes (last 6 digits)', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    const at = (seconds: number) => totpCode(RFC_SECRET, Math.floor(seconds / 30));
    expect(at(59)).toBe('287082');
    expect(at(1111111109)).toBe('081804');
    expect(at(1111111111)).toBe('050471');
    expect(at(1234567890)).toBe('005924');
    expect(at(2000000000)).toBe('279037');
    expect(at(20000000000)).toBe('353130');
  });

  it('accepts one step of clock drift either way, and never the same step twice', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step), null, now)).toBe(step);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), null, now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), null, now)).toBeNull();
    // Already used this step (or a later one): refused.
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step), step, now)).toBeNull();
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), step, now)).toBeNull();
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), step, now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, `${totpCode(RFC_SECRET, step).slice(0, 3)} ${totpCode(RFC_SECRET, step).slice(3)}`, null, now)).toBe(step);
    expect(matchTotp(RFC_SECRET, 'abcdef', null, now)).toBeNull();
  });

  it('makes 160-bit base32 secrets and a standard otpauth link', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    const url = new URL(otpauthUrl(secret, 'Tony Two-Times'));
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/StreetsEmpire:Tony Two-Times');
    expect(url.searchParams.get('secret')).toBe(secret);
    expect(url.searchParams.get('issuer')).toBe('StreetsEmpire');
  });

  it('seals secrets so the database copy is not the secret', () => {
    const secret = generateTotpSecret();
    const sealed = sealSecret(secret);
    expect(sealed).not.toContain(secret);
    expect(sealSecret(secret)).not.toBe(sealed);
    expect(openSecret(sealed)).toBe(secret);
    const [version, iv, tag, body] = sealed.split(':');
    const tampered = [version, iv, tag, `${body!.slice(0, -2)}AA`].join(':');
    expect(() => openSecret(tampered)).toThrow();
  });

  it('makes ten distinct recovery codes, matched however they are typed', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    const code = codes[0]!;
    expect(hashRecoveryCode(code.toUpperCase())).toBe(hashRecoveryCode(code));
    expect(hashRecoveryCode(code.replace('-', ''))).toBe(hashRecoveryCode(code));
    expect(hashRecoveryCode(` ${code} `)).toBe(hashRecoveryCode(code));
  });
});
