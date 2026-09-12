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
    `Street Empire ${action} for ${input.username}`,
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
    <p>Street Empire ${safeAction} for <strong>${safeUser}</strong></p>
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
    subject: 'Street Empire password recovery',
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
    subject: 'Verify your Street Empire email',
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
    subject: 'Confirm your Street Empire email change',
    text,
    html,
  }, log);
}
