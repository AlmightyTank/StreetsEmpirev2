import type { FastifyBaseLogger } from 'fastify';
import { env } from '../config/env.js';
import {
  renderEmailChange,
  renderPasswordReset,
  renderSecurityNotice,
  renderTwoFactorNotice,
  renderVerifyEmail,
  type EmailContext,
  type RenderedEmail,
} from './email-templates.js';

function context(): EmailContext {
  return { gameUrl: env.frontendOrigin, environment: env.appEnvironment };
}

function message(to: string, email: RenderedEmail): MailMessage {
  return { to, subject: email.subject, text: email.text, html: email.html };
}

interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface TokenEmailInput {
  to: string;
  username: string;
  url: string;
  expiresAt: Date;
}

const RESEND_EMAIL_URL = 'https://api.resend.com/emails';

async function sendMail(message: MailMessage, log: FastifyBaseLogger): Promise<void> {
  if (!env.email.enabled) {
    // Name what is missing, so the log says how to fix it.
    const missing = [!env.email.resendApiKey && 'RESEND_API_KEY', !env.email.from && 'EMAIL_FROM'].filter(Boolean).join(' and ');
    const why = missing ? `missing ${missing} in .env` : 'disabled in tests';
    if (env.isProduction) {
      log.error({ to: message.to, missing }, `Resend is not configured (${why}); email was not sent`);
    } else {
      log.warn({ to: message.to, missing, text: message.text }, `Resend is not configured (${why}); email was not sent`);
    }
    return;
  }

  const response = await fetch(RESEND_EMAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.email.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.email.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend email failed with ${response.status}: ${detail.slice(0, 500)}`);
  }
}

export async function sendPasswordResetEmail(input: TokenEmailInput, log: FastifyBaseLogger): Promise<void> {
  await sendMail(message(input.to, renderPasswordReset(input, context())), log);
}

export async function sendCurrentEmailVerification(input: TokenEmailInput, log: FastifyBaseLogger): Promise<void> {
  await sendMail(message(input.to, renderVerifyEmail(input, context())), log);
}

export async function sendEmailChangeVerification(input: TokenEmailInput & { currentEmail: string }, log: FastifyBaseLogger): Promise<void> {
  await sendMail(message(input.to, renderEmailChange({ ...input, newEmail: input.to }, context())), log);
}

/** rc.3. A heads-up whenever two-step sign-in changes, so a hijack does not go unnoticed. */
export async function sendTwoFactorNotice(
  input: { to: string; username: string; change: 'enabled' | 'disabled' | 'reset' | 'codes' },
  log: FastifyBaseLogger,
): Promise<void> {
  const accountUrl = new URL('/account', env.frontendOrigin).toString();
  await sendMail(message(input.to, renderTwoFactorNotice({ ...input, accountUrl }, context())), log);
}

/** rc.5. Security notices: a changed password, and a sign-in from a browser this account had not used. */
export async function sendSecurityNotice(
  input: {
    to: string;
    username: string;
    kind: 'password-changed' | 'new-sign-in';
    when: Date;
    browser: string | null;
    ip: string | null;
    accountUrl: string;
  },
  log: FastifyBaseLogger,
): Promise<void> {
  await sendMail(message(input.to, renderSecurityNotice(input, context())), log);
}
