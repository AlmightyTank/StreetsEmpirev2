import type { FastifyBaseLogger } from 'fastify';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * rc.5/rc.6. Cloudflare Turnstile on password sign-in, sign-up and password reset: stops
 * scripted password guessing, and sign-up floods that rotate addresses past the
 * per-network cap. Off unless both keys are set. When it is on and Cloudflare cannot be
 * reached, the request is refused rather than let through.
 */
export async function assertHuman(token: string | undefined, ip: string, log: FastifyBaseLogger): Promise<void> {
  if (!env.turnstile.enabled) return;
  if (!token) throw AppError.badRequest('CAPTCHA_REQUIRED', 'Finish the "are you human" check first.');
  let result: { success?: boolean; 'error-codes'?: string[] };
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.turnstile.secretKey, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    result = (await response.json()) as typeof result;
  } catch (error) {
    log.warn({ err: error }, 'turnstile verification unreachable');
    throw new AppError(503, 'CAPTCHA_UNAVAILABLE', 'The "are you human" check could not be reached. Try again in a minute.');
  }
  if (!result.success) {
    log.info({ codes: result['error-codes'] }, 'turnstile check failed');
    throw AppError.badRequest('CAPTCHA_FAILED', 'The "are you human" check did not pass. Try it again.');
  }
}
