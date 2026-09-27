import { describe, expect, it } from 'vitest';
import {
  formatLifetime,
  renderEmailChange,
  renderPasswordReset,
  renderSecurityNotice,
  renderTwoFactorNotice,
  renderVerifyEmail,
  type EmailContext,
} from '../email-templates.js';

const now = new Date('2026-09-27T16:03:00Z');
const production: EmailContext = { gameUrl: 'https://play.streetsempire.dev', environment: 'production', now };
const beta: EmailContext = { ...production, gameUrl: 'https://beta.streetsempire.dev', environment: 'beta' };
const inAnHour = new Date(now.getTime() + 3_600_000);
const url = 'https://play.streetsempire.dev/reset-password?token=abc&x=1';

describe('branded emails', () => {
  it('puts the link in the button, the fallback and the text version', () => {
    const email = renderPasswordReset({ username: 'Tony', url, expiresAt: inAnHour }, production);
    expect(email.subject).toBe('Reset your StreetsEmpire password');
    // The & in the link is escaped in HTML, and the button and fallback both carry it.
    expect(email.html.match(/reset-password\?token=abc&amp;x=1/g)).toHaveLength(3);
    expect(email.text).toContain(url);
    expect(email.text).toContain('for the next hour');
    expect(email.html).toContain('for the next hour');
  });

  it('never lets a player name or email break out of the HTML', () => {
    const nasty = '<img src=x onerror=alert(1)>"Tony"';
    const html = [
      renderVerifyEmail({ username: nasty, url, expiresAt: inAnHour }, production).html,
      renderEmailChange({ username: nasty, url, expiresAt: inAnHour, currentEmail: nasty, newEmail: 'a@b.c' }, production).html,
      renderSecurityNotice({ username: nasty, kind: 'new-sign-in', when: now, browser: nasty, ip: '1.2.3.4', accountUrl: url }, production).html,
      renderTwoFactorNotice({ username: nasty, change: 'enabled', accountUrl: url }, production).html,
    ].join('');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;Tony&quot;');
  });

  it('marks beta emails in the subject and the header, and never production ones', () => {
    const betaEmail = renderVerifyEmail({ username: 'Tony', url, expiresAt: inAnHour }, beta);
    expect(betaEmail.subject).toBe('[Beta] Confirm your email for StreetsEmpire');
    expect(betaEmail.html).toContain('>Beta</span>');
    expect(betaEmail.text.split('\n')[0]).toBe('STREETSEMPIRE [Beta]');
    const live = renderVerifyEmail({ username: 'Tony', url, expiresAt: inAnHour }, production);
    expect(live.subject).not.toContain('[');
    expect(live.html).not.toContain('>Beta</span>');
  });

  it('shows security details in UTC wording, and a red stripe for alerts', () => {
    const email = renderSecurityNotice({ username: 'Tony', kind: 'password-changed', when: now, browser: 'Chrome on Windows', ip: '203.0.113.24', accountUrl: url }, production);
    expect(email.text).toContain('When: Sep 27, 2026, 4:03 PM UTC');
    expect(email.text).toContain('Browser: Chrome on Windows');
    expect(email.html).toContain('border-top:3px solid #ff5468');
    expect(renderTwoFactorNotice({ username: 'Tony', change: 'enabled', accountUrl: url }, production).html).toContain('border-top:3px solid #b6ff3a');
  });

  it('says how long a link lasts in words', () => {
    expect(formatLifetime(new Date(now.getTime() + 30 * 60_000), now)).toBe('30 minutes');
    expect(formatLifetime(inAnHour, now)).toBe('1 hour');
    expect(formatLifetime(new Date(now.getTime() + 24 * 3_600_000), now)).toBe('24 hours');
  });
});
