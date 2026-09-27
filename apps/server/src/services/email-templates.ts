/**
 * Branded emails. One layout for every message the game sends, built the way email
 * clients (Outlook and Gmail included) render reliably: tables, inline styles, no web
 * fonts, no images to be blocked. Every email also has a plain-text version.
 *
 * These are pure functions: `npm run email:preview` renders each one to a file.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Where the emails point, and which server sent them. */
export interface EmailContext {
  /** The game, e.g. https://play.streetsempire.dev */
  gameUrl: string;
  environment: 'production' | 'beta' | 'development' | 'test';
  now?: Date;
}

type Tone = 'normal' | 'alert';

interface Layout {
  subject: string;
  /** The grey preview line inbox lists show after the subject. */
  preheader: string;
  eyebrow: string;
  heading: string;
  /** Plain sentences; each becomes a paragraph. */
  paragraphs: string[];
  button?: { label: string; url: string };
  details?: Array<[label: string, value: string]>;
  /** Small print under the card body, e.g. "Didn't ask for this? Ignore it." */
  note?: string;
  tone?: Tone;
}

const COLORS = {
  page: '#0b0c0e',
  card: '#14161a',
  cardInset: '#191d23',
  line: '#262b33',
  text: '#dbe0e7',
  dim: '#98a1ad',
  muted: '#6b7480',
  accent: '#b6ff3a',
  alert: '#ff5468',
  onAccent: '#0b0c0e',
  beta: '#f5b93b',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** "Sep 27, 2026, 4:03 PM UTC": the same wording for every reader, wherever they are. */
export function formatWhen(date: Date): string {
  return `${new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }).format(date)} UTC`;
}

/** "30 minutes", "1 hour", "2 hours": how long a link keeps working. */
export function formatLifetime(expiresAt: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - now.getTime()) / 60_000));
  if (minutes < 90) return minutes === 60 ? '1 hour' : `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `${hours} hours`;
}

/** "the next hour", "the next 30 minutes". */
function forTheNext(lifetime: string): string {
  return lifetime === '1 hour' ? 'the next hour' : `the next ${lifetime}`;
}

function environmentTag(environment: EmailContext['environment']): string | null {
  return environment === 'production' ? null : environment === 'beta' ? 'Beta' : 'Dev';
}

function layout(input: Layout, context: EmailContext): RenderedEmail {
  const tag = environmentTag(context.environment);
  const subject = tag ? `[${tag}] ${input.subject}` : input.subject;
  const stripe = input.tone === 'alert' ? COLORS.alert : COLORS.accent;
  const accountUrl = new URL('/account', context.gameUrl).toString();

  const paragraphs = input.paragraphs
    .map((text) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.text};">${escapeHtml(text)}</p>`)
    .join('');

  const button = input.button
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;">
        <tr>
          <td bgcolor="${COLORS.accent}" style="border-radius:4px;mso-padding-alt:14px 28px;">
            <a href="${escapeHtml(input.button.url)}" target="_blank"
               style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.onAccent};text-decoration:none;border-radius:4px;">
              ${escapeHtml(input.button.label)}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:${COLORS.muted};">
        Button not working? Copy this link into your browser:<br />
        <a href="${escapeHtml(input.button.url)}" style="color:${COLORS.dim};word-break:break-all;">${escapeHtml(input.button.url)}</a>
      </p>`
    : '';

  const details = input.details?.length
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
             style="margin:0 0 20px;background:${COLORS.cardInset};border:1px solid ${COLORS.line};border-radius:4px;">
        ${input.details.map(([label, value], index) => `
        <tr>
          <td style="padding:10px 14px;${index ? `border-top:1px solid ${COLORS.line};` : ''}font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.muted};width:34%;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:10px 14px;${index ? `border-top:1px solid ${COLORS.line};` : ''}font-size:14px;color:${COLORS.text};word-break:break-word;">${escapeHtml(value)}</td>
        </tr>`).join('')}
      </table>`
    : '';

  const note = input.note
    ? `<p style="margin:0;padding-top:16px;border-top:1px solid ${COLORS.line};font-size:13px;line-height:1.5;color:${COLORS.dim};">${escapeHtml(input.note)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.page};">${escapeHtml(input.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${COLORS.page}" style="background:${COLORS.page};">
  <tr>
    <td align="center" style="padding:28px 12px;font-family:${FONT};">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
        <tr>
          <td style="padding:0 4px 18px;">
            <a href="${escapeHtml(context.gameUrl)}" style="text-decoration:none;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:0.02em;">
              <span style="color:#ffffff;">STREETS</span><span style="color:${COLORS.accent};">EMPIRE</span>
            </a>${tag ? `
            <span style="display:inline-block;margin-left:8px;padding:2px 8px;border:1px solid ${COLORS.beta};border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${COLORS.beta};vertical-align:3px;">${tag}</span>` : ''}
          </td>
        </tr>
        <tr>
          <td bgcolor="${COLORS.card}" style="background:${COLORS.card};border:1px solid ${COLORS.line};border-top:3px solid ${stripe};border-radius:4px;padding:28px 28px 24px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${stripe};">${escapeHtml(input.eyebrow)}</p>
            <h1 style="margin:0 0 18px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:800;color:#ffffff;">${escapeHtml(input.heading)}</h1>
            ${paragraphs}
            ${button}
            ${details}
            ${note}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 4px 0;font-size:12px;line-height:1.6;color:${COLORS.muted};">
            You are getting this because it is about your StreetsEmpire account. It is not marketing, and we never ask for your password by email.<br />
            <a href="${escapeHtml(accountUrl)}" style="color:${COLORS.dim};">Account settings</a>
            &nbsp;&middot;&nbsp;
            <a href="${escapeHtml(context.gameUrl)}" style="color:${COLORS.dim};">Play StreetsEmpire</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    `STREETSEMPIRE${tag ? ` [${tag}]` : ''}`,
    '',
    input.heading,
    '',
    ...input.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(input.button ? [`${input.button.label}:`, input.button.url, ''] : []),
    ...(input.details?.length ? [...input.details.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(input.note ? [input.note, ''] : []),
    '--',
    'You are getting this because it is about your StreetsEmpire account. We never ask for your password by email.',
    `Account settings: ${accountUrl}`,
  ].join('\n');

  return { subject, html, text };
}

/* ---------- The emails ---------- */

export function renderPasswordReset(input: { username: string; url: string; expiresAt: Date }, context: EmailContext): RenderedEmail {
  const lifetime = formatLifetime(input.expiresAt, context.now ?? new Date());
  return layout({
    subject: 'Reset your StreetsEmpire password',
    preheader: `Choose a new password for ${input.username}. The link works for ${lifetime}.`,
    eyebrow: 'Password recovery',
    heading: 'Choose a new password',
    paragraphs: [
      `Someone asked to reset the password for ${input.username}. If that was you, choose a new one below.`,
      `The link works once, for ${forTheNext(lifetime)}.`,
    ],
    button: { label: 'Choose a new password', url: input.url },
    note: 'Did not ask for this? You can ignore this email: your password stays the same, and nobody gets in without the link.',
  }, context);
}

export function renderVerifyEmail(input: { username: string; url: string; expiresAt: Date }, context: EmailContext): RenderedEmail {
  const lifetime = formatLifetime(input.expiresAt, context.now ?? new Date());
  return layout({
    subject: 'Confirm your email for StreetsEmpire',
    preheader: `One tap and ${input.username} is ready to play.`,
    eyebrow: 'Welcome to the streets',
    heading: `Confirm your email, ${input.username}`,
    paragraphs: [
      'Confirm this is your address and you can start playing. It is also how you get back in if you ever forget your password.',
      `The link works for ${forTheNext(lifetime)}. Expired? Sign in and press "Send the link again".`,
    ],
    button: { label: 'Confirm my email', url: input.url },
    note: 'Did not sign up for StreetsEmpire? Ignore this email and the account will not be confirmed.',
  }, context);
}

export function renderEmailChange(input: { username: string; url: string; expiresAt: Date; currentEmail: string; newEmail: string }, context: EmailContext): RenderedEmail {
  const lifetime = formatLifetime(input.expiresAt, context.now ?? new Date());
  return layout({
    subject: 'Confirm your new StreetsEmpire email',
    preheader: `Confirm ${input.newEmail} as the email for ${input.username}.`,
    eyebrow: 'Email change',
    heading: 'Confirm your new email',
    paragraphs: [
      `${input.username} asked to use this address from now on. Confirm it and it becomes the email you sign in and recover the account with.`,
      `The link works for ${forTheNext(lifetime)}.`,
    ],
    button: { label: 'Confirm new email', url: input.url },
    details: [['Current email', input.currentEmail], ['New email', input.newEmail]],
    note: 'Did not ask for this? Ignore this email and nothing changes.',
  }, context);
}

export type TwoFactorChange = 'enabled' | 'disabled' | 'reset' | 'codes';

export function renderTwoFactorNotice(input: { username: string; change: TwoFactorChange; accountUrl: string }, context: EmailContext): RenderedEmail {
  const copy = {
    enabled: {
      subject: 'Two-step sign-in is on',
      heading: 'Two-step sign-in is on',
      body: 'From now on, signing in to your account also asks for a code from your authenticator app. Keep your recovery codes somewhere safe: they get you in if you lose your phone.',
      tone: 'normal' as Tone,
    },
    disabled: {
      subject: 'Two-step sign-in was turned off',
      heading: 'Two-step sign-in was turned off',
      body: 'Your account no longer asks for an authenticator code when you sign in. You can turn it back on in your account settings at any time.',
      tone: 'alert' as Tone,
    },
    reset: {
      subject: 'Staff turned off two-step sign-in',
      heading: 'Two-step sign-in was reset',
      body: 'Staff turned off two-step sign-in on your account, as you asked. Sign in with your password, then set up your authenticator again in account settings.',
      tone: 'alert' as Tone,
    },
    codes: {
      subject: 'You have new recovery codes',
      heading: 'New recovery codes',
      body: 'New recovery codes were made for your account, and the old ones no longer work. Keep the new ones somewhere safe.',
      tone: 'normal' as Tone,
    },
  }[input.change];
  return layout({
    subject: copy.subject,
    preheader: `${copy.heading} for ${input.username}.`,
    eyebrow: 'Account security',
    heading: copy.heading,
    paragraphs: [copy.body],
    button: { label: 'Open account settings', url: input.accountUrl },
    details: [['Account', input.username], ['When', formatWhen(context.now ?? new Date())]],
    note: 'Not you? Change your password now and tell staff on Discord.',
    tone: copy.tone,
  }, context);
}

export function renderSecurityNotice(
  input: { username: string; kind: 'password-changed' | 'new-sign-in'; when: Date; browser: string | null; ip: string | null; accountUrl: string },
  context: EmailContext,
): RenderedEmail {
  const details: Array<[string, string]> = [
    ['Account', input.username],
    ['When', formatWhen(input.when)],
    ...(input.browser ? [['Browser', input.browser] as [string, string]] : []),
    ...(input.ip ? [['Address', input.ip] as [string, string]] : []),
  ];
  if (input.kind === 'password-changed') {
    return layout({
      subject: 'Your StreetsEmpire password was changed',
      preheader: `The password for ${input.username} was just changed.`,
      eyebrow: 'Account security',
      heading: 'Your password was changed',
      paragraphs: ['The password for your account was just changed. If that was you, there is nothing else to do.'],
      button: { label: 'Review my account', url: input.accountUrl },
      details,
      note: 'Not you? Reset your password now from the log-in page ("Forgot your password?") and tell staff on Discord.',
      tone: 'alert',
    }, context);
  }
  return layout({
    subject: 'New sign-in to your StreetsEmpire account',
    preheader: `${input.username} just signed in from ${input.browser ?? 'a new browser'}.`,
    eyebrow: 'Account security',
    heading: 'New sign-in to your account',
    paragraphs: ['Your account just signed in from a browser it has not used before. If that was you, there is nothing to do.'],
    button: { label: 'Review my sessions', url: input.accountUrl },
    details,
    note: 'Not you? Change your password, then sign that session out under "Login sessions" in your account settings.',
    tone: 'alert',
  }, context);
}
