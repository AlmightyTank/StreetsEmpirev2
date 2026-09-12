import type { FastifyBaseLogger } from 'fastify';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.js';

interface PasswordResetEmail {
  to: string;
  username: string;
  resetUrl: string;
  expiresAt: Date;
}

let transporter: Transporter | null = null;

function mailTransport(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.secure,
    auth: env.email.user || env.email.pass
      ? { user: env.email.user, pass: env.email.pass }
      : undefined,
  });
  return transporter;
}

function textBody(input: PasswordResetEmail): string {
  return [
    `Street Empire password recovery for ${input.username}`,
    '',
    'Use this link to set a new password:',
    input.resetUrl,
    '',
    `This link expires at ${input.expiresAt.toLocaleString()}.`,
    'If you did not ask for this, you can ignore this email.',
  ].join('\n');
}

function htmlBody(input: PasswordResetEmail): string {
  return `
    <p>Street Empire password recovery for <strong>${input.username}</strong></p>
    <p><a href="${input.resetUrl}">Set a new password</a></p>
    <p>This link expires at ${input.expiresAt.toLocaleString()}.</p>
    <p>If you did not ask for this, you can ignore this email.</p>
  `;
}

export async function sendPasswordResetEmail(
  input: PasswordResetEmail,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!env.email.enabled) {
    if (env.isProduction) {
      log.error({ to: input.to }, 'SMTP is not configured; password recovery email was not sent');
    } else {
      log.warn(
        { resetUrl: input.resetUrl, to: input.to },
        'SMTP is not configured; password recovery link was not emailed',
      );
    }
    return;
  }

  await mailTransport().sendMail({
    from: env.email.from,
    to: input.to,
    subject: 'Street Empire password recovery',
    text: textBody(input),
    html: htmlBody(input),
  });
}

