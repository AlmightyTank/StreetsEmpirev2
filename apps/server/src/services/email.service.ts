import type { FastifyBaseLogger } from 'fastify';
import { env } from '../config/env.js';

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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function tokenText(input: TokenEmailInput, action: string): string {
  return [
    `StreetsEmpire ${action} for ${input.username}`,
    '',
    `Use this link to ${action}:`,
    input.url,
    '',
    `This link expires at ${input.expiresAt.toLocaleString()}.`,
    'If you did not ask for this, you can ignore this email.',
  ].join('\n');
}

function tokenHtml(input: TokenEmailInput, action: string): string {
  const safeUser = escapeHtml(input.username);
  const safeAction = escapeHtml(action);
  const safeUrl = escapeHtml(input.url);
  const safeExpires = escapeHtml(input.expiresAt.toLocaleString());

  return `
    <p>StreetsEmpire ${safeAction} for <strong>${safeUser}</strong></p>
    <p><a href="${safeUrl}">${safeAction}</a></p>
    <p>This link expires at ${safeExpires}.</p>
    <p>If you did not ask for this, you can ignore this email.</p>
  `;
}

async function sendMail(message: MailMessage, log: FastifyBaseLogger): Promise<void> {
  if (!env.email.enabled) {
    if (env.isProduction) {
      log.error({ to: message.to }, 'Resend is not configured; email was not sent');
    } else {
      log.warn({ to: message.to, text: message.text }, 'Resend is not configured; email was not sent');
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

export async function sendPasswordResetEmail(
  input: TokenEmailInput,
  log: FastifyBaseLogger,
): Promise<void> {
  const action = 'set a new password';
  await sendMail({
    to: input.to,
    subject: 'StreetsEmpire password recovery',
    text: tokenText(input, action),
    html: tokenHtml(input, action),
  }, log);
}

export async function sendCurrentEmailVerification(
  input: TokenEmailInput,
  log: FastifyBaseLogger,
): Promise<void> {
  const action = 'verify your email';
  await sendMail({
    to: input.to,
    subject: 'Verify your StreetsEmpire email',
    text: tokenText(input, action),
    html: tokenHtml(input, action),
  }, log);
}

export async function sendEmailChangeVerification(
  input: TokenEmailInput & { currentEmail: string },
  log: FastifyBaseLogger,
): Promise<void> {
  const action = 'change your email';
  const text = `${tokenText(input, action)}\n\nCurrent email: ${input.currentEmail}\nNew email: ${input.to}`;
  const html = `${tokenHtml(input, action)}<p>Current email: ${escapeHtml(input.currentEmail)}<br />New email: ${escapeHtml(input.to)}</p>`;

  await sendMail({
    to: input.to,
    subject: 'Confirm your StreetsEmpire email change',
    text,
    html,
  }, log);
}

/** rc.3. A heads-up whenever two-step sign-in changes, so a hijack does not go unnoticed. */
export async function sendTwoFactorNotice(
  input: { to: string; username: string; change: 'enabled' | 'disabled' | 'reset' | 'codes' },
  log: FastifyBaseLogger,
): Promise<void> {
  const what = {
    enabled: 'Two-step sign-in with an authenticator app was turned on',
    disabled: 'Two-step sign-in was turned off',
    reset: 'Staff turned off two-step sign-in, as you asked',
    codes: 'New recovery codes were made; the old ones no longer work',
  }[input.change];
  const text = [
    `StreetsEmpire account ${input.username}`,
    '',
    `${what}.`,
    '',
    'If this was not you, change your password now and tell staff on Discord.',
  ].join('\n');
  const html = `
    <p>StreetsEmpire account <strong>${escapeHtml(input.username)}</strong></p>
    <p>${escapeHtml(what)}.</p>
    <p>If this was not you, change your password now and tell staff on Discord.</p>
  `;
  await sendMail({ to: input.to, subject: 'StreetsEmpire sign-in security changed', text, html }, log);
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
  const what = input.kind === 'password-changed'
    ? 'Your password was changed'
    : 'Someone signed in to your account from a browser it has not used before';
  const details = [
    `When: ${input.when.toUTCString()}`,
    ...(input.browser ? [`Browser: ${input.browser}`] : []),
    ...(input.ip ? [`Address: ${input.ip}`] : []),
  ];
  const advice = input.kind === 'password-changed'
    ? 'If this was not you, reset your password now from the log-in page and tell staff on Discord.'
    : 'If this was you, there is nothing to do. If not, change your password and sign that session out in your account settings.';
  const text = [`StreetsEmpire account ${input.username}`, '', `${what}.`, '', ...details, '', advice, input.accountUrl].join('\n');
  const html = `
    <p>StreetsEmpire account <strong>${escapeHtml(input.username)}</strong></p>
    <p>${escapeHtml(what)}.</p>
    <p>${details.map(escapeHtml).join('<br />')}</p>
    <p>${escapeHtml(advice)}</p>
    <p><a href="${escapeHtml(input.accountUrl)}">Your account settings</a></p>
  `;
  await sendMail({
    to: input.to,
    subject: input.kind === 'password-changed' ? 'Your StreetsEmpire password was changed' : 'New sign-in to your StreetsEmpire account',
    text,
    html,
  }, log);
}
