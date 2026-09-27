/**
 * Renders every email the game sends into a folder, as .html (open in a browser) and
 * .txt (the plain-text part), with sample data. Nothing is sent.
 *
 *   npm run email:preview                 # into ./email-previews
 *   npm run email:preview -- /tmp/emails --beta
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  renderEmailChange,
  renderPasswordReset,
  renderSecurityNotice,
  renderTwoFactorNotice,
  renderVerifyEmail,
  type EmailContext,
  type RenderedEmail,
} from '../../apps/server/src/services/email-templates.js';

const args = process.argv.slice(2);
const dir = resolve(args.find((arg) => !arg.startsWith('--')) ?? 'email-previews');
const environment: EmailContext['environment'] = args.includes('--beta') ? 'beta' : 'production';
const now = new Date();
const context: EmailContext = { gameUrl: environment === 'beta' ? 'https://beta.streetsempire.dev' : 'https://play.streetsempire.dev', environment, now };
const inAnHour = new Date(now.getTime() + 60 * 60_000);
const link = (path: string) => `${context.gameUrl}${path}?token=Zx3fQ9sample0token0for0preview0only`;
const accountUrl = `${context.gameUrl}/account`;
const username = 'TonyTwoTimes';

const emails: Record<string, RenderedEmail> = {
  'verify-email': renderVerifyEmail({ username, url: link('/verify-email'), expiresAt: inAnHour }, context),
  'password-reset': renderPasswordReset({ username, url: link('/reset-password'), expiresAt: inAnHour }, context),
  'email-change': renderEmailChange({ username, url: link('/verify-email'), expiresAt: inAnHour, currentEmail: 'tony@example.com', newEmail: 'tony.new@example.com' }, context),
  'password-changed': renderSecurityNotice({ username, kind: 'password-changed', when: now, browser: 'Chrome on Windows', ip: '203.0.113.24', accountUrl }, context),
  'new-sign-in': renderSecurityNotice({ username, kind: 'new-sign-in', when: now, browser: 'Safari on iOS', ip: '198.51.100.7', accountUrl }, context),
  'two-step-on': renderTwoFactorNotice({ username, change: 'enabled', accountUrl }, context),
  'two-step-off': renderTwoFactorNotice({ username, change: 'disabled', accountUrl }, context),
  'two-step-reset': renderTwoFactorNotice({ username, change: 'reset', accountUrl }, context),
  'recovery-codes': renderTwoFactorNotice({ username, change: 'codes', accountUrl }, context),
};

mkdirSync(dir, { recursive: true });
for (const [name, email] of Object.entries(emails)) {
  writeFileSync(join(dir, `${name}.html`), email.html);
  writeFileSync(join(dir, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`);
  console.log(`${name.padEnd(16)} ${email.subject}`);
}
console.log(`\nWrote ${Object.keys(emails).length} emails (${environment}) to ${dir}`);
