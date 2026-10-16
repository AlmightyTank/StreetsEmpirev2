#!/usr/bin/env node
/**
 * 1.0.0-G. Mobile and accessibility audit of the game client, in a real browser.
 *
 *   npm run qa:ui -- [--base http://127.0.0.1:5173] [--out ./ui-audit] [--shots] [--strict]
 *   npm run qa:ui -- --dashboard --shots --strict --base http://127.0.0.1:5173
 *   --dashboard audits the real signed-in Command Center at all six widths.
 *
 * Against a running web client and API (npm run dev), it visits every major page
 * at the release width matrix (360/390/768/1024/1440/1920), with both desktop
 * sidebar modes and representative premium shell themes, and for each one records:
 *
 *   overflow   the page scrolls sideways (anything wider than the screen that is not
 *              inside its own horizontal scroller)
 *   targets    buttons, links and fields a thumb can hit: under 24x24 px fails
 *              (WCAG 2.2 target size, inline text links excepted); under 44x44 is noted
 *   focus      Tab moves focus with a visible indicator, and the first stop skips to content
 *   axe        axe-core's WCAG 2.2 A/AA rules: labels, names, contrast, roles, landmarks...
 *
 * Accounts: UI_AUDIT_PLAYER="username:password" (in the current season) and optionally
 * UI_AUDIT_ADMIN="username:password" for the admin pages. Without UI_AUDIT_PLAYER a
 * fresh player is registered and joined, which needs an open, non-invite-only server.
 *
 * Browser: CHROMIUM_PATH, else Playwright's own Chromium if installed.
 * Writes report.md and report.json to --out. --strict exits 1 on any failure.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const BASE = option('base', 'http://127.0.0.1:5173').replace(/\/$/, '');
const OUT = path.resolve(option('out', 'ui-audit'));
const SHOTS = args.includes('--shots');
const DASHBOARD_ONLY = args.includes('--dashboard');
const STRICT = args.includes('--strict');
const ONLY = option('only', '');
// The API rate-limits each account; three widths of every page in a row trips it without a pause.
const PACE_MS = Number(option('pace', '900'));
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const WIDTHS = [
  { name: 'phone-360', width: 360, height: 740, mobile: true, touch: true, rail: false, theme: 'casino-floor' },
  { name: 'phone-390', width: 390, height: 844, mobile: true, touch: true, rail: false, theme: 'federal-case' },
  { name: 'tablet-768', width: 768, height: 1024, mobile: false, touch: true, rail: false, theme: 'midnight-market' },
  { name: 'desktop-1024-expanded', width: 1024, height: 768, mobile: false, touch: false, rail: false, theme: 'casino-floor' },
  { name: 'desktop-1440-rail', width: 1440, height: 900, mobile: false, touch: false, rail: true, theme: 'federal-case' },
  { name: 'desktop-1920-expanded', width: 1920, height: 1080, mobile: false, touch: false, rail: false, theme: 'midnight-market' },
];

const PUBLIC_PAGES = ['/', '/login', '/register', '/forgot-password'];
const PLAYER_PAGES = [
  '/game', '/game/scout', '/game/produce', '/game/combat', '/game/quests', '/game/hideout',
  '/game/casino/slots', '/game/casino/blackjack', '/game/casino/roulette', '/game/casino/street-dice', '/game/casino/poker', '/game/casino/sportsbook',
  '/game/stores', '/game/stores/pip', '/game/stores/charlie', '/game/stores/iron-maya',
  '/game/travel', '/game/turf', '/game/crew', '/game/blocks', '/game/cities', '/game/rankings', '/game/players',
  '/game/alliance', '/game/alliances', '/game/contacts', '/game/console', '/game/profile',
  '/game/activity', '/game/reputation', '/game/news', '/game/status', '/game/rules', '/game/hall-of-fame', '/game/round-archive', '/account',
];
const ADMIN_PAGES = [
  '/game/admin', '/game/admin/monitoring', '/game/admin/news', '/game/admin/accounts', '/game/admin/quests', '/game/admin/surveys',
  '/game/admin/integrations', '/game/admin/rulesets', '/game/admin/signals', '/game/admin/audit', '/game/admin/reports', '/game/admin/crew',
  '/game/admin/economy', '/game/admin/casino', '/game/admin/law', '/game/admin/combat', '/game/admin/turf',
];

async function api(context, method, url, data) {
  const response = await context.request.fetch(BASE + url, { method, data, failOnStatusCode: false });
  let body = null;
  try { body = await response.json(); } catch { /* not JSON */ }
  return { status: response.status(), body };
}

async function signedIn(browser, credentials, label) {
  const context = await browser.newContext();
  let [username, password] = (credentials ?? '').split(':');
  if (!username) {
    username = `audit${Math.random().toString(36).slice(2, 8)}`;
    password = `password-${username}`;
    const made = await api(context, 'POST', '/api/auth/register', { ageConfirmed: true, username, email: `${username}@example.invalid`, password });
    if (made.status >= 300) throw new Error(`could not register an audit player (${made.status} ${made.body?.error?.code ?? ''}); set UI_AUDIT_PLAYER.`);
    await api(context, 'POST', '/api/rounds/current/join', {});
  } else {
    const login = await api(context, 'POST', '/api/auth/login', { identifier: username, password });
    if (login.status >= 300) throw new Error(`${label} could not sign in as ${username} (${login.status}).`);
  }
  const state = await context.storageState();
  const extras = {};
  if (label === 'admin') {
    const rounds = await api(context, 'GET', '/api/admin/rounds');
    const round = rounds.body?.rounds?.find((row) => row.status === 'ACTIVE') ?? rounds.body?.rounds?.[0];
    if (round) extras.round = round.id;
    const me = await api(context, 'GET', '/api/auth/me');
    if (me.body?.account?.id) extras.account = me.body.account.id;
  }
  await context.close();
  return { state, extras, username };
}

/** Everything measured inside the page. Kept to plain DOM so it runs anywhere. */
function measure(isMobile) {
  const vw = document.documentElement.clientWidth;
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const text = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const visible = (el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0 && Number(style.opacity) > 0;
  };
  const scrollsSideways = (el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      // Inside its own scroller or clipped by an ancestor: not the page's problem.
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) return true;
    }
    return false;
  };

  const overflow = document.documentElement.scrollWidth > vw + 1;
  const wide = [];
  if (overflow) {
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const box = el.getBoundingClientRect();
      if (box.right > vw + 1 && !scrollsSideways(el)) wide.push(`${describe(el)} (right edge ${Math.round(box.right)}px)`);
      if (wide.length >= 8) break;
    }
  }

  const targets = { fail: [], small: 0, smallList: [], total: 0 };
  if (isMobile) {
    const selector = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [tabindex]:not([tabindex="-1"])';
    for (const el of document.querySelectorAll(selector)) {
      if (!visible(el) || el.closest('[aria-hidden="true"], .se-footer, footer')) continue;
      let box = el.getBoundingClientRect();
      if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) box = el.closest('label').getBoundingClientRect();
      // WCAG 2.5.8 inline exception: a link inside a sentence.
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline'
        && (el.parentElement?.textContent ?? '').trim().length > (el.textContent ?? '').trim().length + 8;
      if (inline) continue;
      targets.total++;
      if (box.width < 24 || box.height < 24) targets.fail.push(`${describe(el)} ${Math.round(box.width)}x${Math.round(box.height)}`);
      else if (box.width < 44 || box.height < 44) {
        targets.small++;
        if (targets.smallList.length < 25) targets.smallList.push(`${describe(el)} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
  }
  return { overflow, scrollWidth: document.documentElement.scrollWidth, viewport: vw, wide, targets };
}

async function focusCheck(page) {
  const stops = [];
  // Start Tab from the top of the page, as a fresh visit does, even when a field has autofocus.
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
    const start = document.createElement('span');
    start.tabIndex = -1;
    start.id = '__audit_start';
    document.body.prepend(start);
    start.focus();
  });
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const ring = (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || (style.boxShadow && style.boxShadow !== 'none');
      const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return { what: `${el.tagName.toLowerCase()} "${text}"`, ring, skip: /skip to/i.test(text) };
    }));
  }
  await page.evaluate(() => document.getElementById('__audit_start')?.remove());
  const real = stops.filter(Boolean);
  return {
    firstIsSkip: Boolean(real[0]?.skip),
    unringed: real.filter((stop) => !stop.ring).map((stop) => stop.what),
  };
}

async function axeCheck(page) {
  await page.addScriptTag({ content: AXE_SOURCE });
  const result = await page.evaluate(async () => {
    const run = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      resultTypes: ['violations'],
    });
    return run.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  });
  return result;
}

async function dismissIntro(page) {
  const skip = page.getByRole('button', { name: /skip intro/i });
  if (await skip.count()) {
    await skip.first().click().catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

/** Validate the actual authenticated Command Center layout—not a mock image. */
async function checkDashboard(page, width) {
  return page.evaluate(({ name, width: viewport }) => {
    const root = document.querySelector('.se-dashboard');
    if (!root) return { issues: ['Dashboard did not render (account may not be in a round).'] };
    const sections = [
      '.se-dashboard-hero',
      '.se-dashboard-snapshot',
      '.se-dashboard-overview',
      '.se-dashboard-quick',
      '.se-dashboard-highlights',
      '.se-dashboard-command',
    ];
    const nodes = sections.map((selector) => root.querySelector(selector));
    const issues = [];
    if (nodes.some((node) => !node)) issues.push('Missing one or more required Command Center sections.');
    const statCards = root.querySelectorAll('.se-dashboard-snapshot__tile');
    const actions = root.querySelectorAll('.se-dashboard-quick .se-dashboard-action');
    if (statCards.length !== 6) issues.push(`Expected six stat cards; found ${statCards.length}.`);
    if (actions.length !== 6) issues.push(`Expected six action cards; found ${actions.length}.`);
    const story = root.querySelector('.se-dashboard-story');
    const alerts = root.querySelector('.se-dashboard-command__attention');
    const hero = root.querySelector('.se-dashboard-hero');
    if (!story || !alerts || !hero) issues.push('Missing story, attention or hero region.');
    for (let i = 1; i < nodes.length; i++) {
      const previous = nodes[i - 1], current = nodes[i];
      if (previous && current && !(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        issues.push('Dashboard visual sections are in the wrong reading order.');
        break;
      }
    }
    const hitAreas = [...root.querySelectorAll('.se-dashboard-action, .se-dashboard-fold__summary')];
    const small = hitAreas.filter((el) => {
      const { width, height } = el.getBoundingClientRect();
      return width < 44 || height < 44;
    });
    if (small.length) issues.push(`${small.length} primary actions/disclosures are smaller than 44px.`);
    // At phone widths, two actions should share a row, not be crushed into six columns.
    if (viewport <= 390 && actions.length >= 2) {
      const first = actions[0].getBoundingClientRect();
      const second = actions[1].getBoundingClientRect();
      if (Math.abs(first.top - second.top) > 6) issues.push('Quick actions do not form the expected two-column phone grid.');
    }
    const status = root.querySelector('.se-dashboard-hero__identity h1')?.textContent?.trim() ?? '';
    if (status !== 'Command Center') issues.push('Command Center heading is missing or incorrect.');
    if (root.scrollWidth > root.clientWidth + 2) issues.push('Dashboard content overflows its own grid.');
    return { issues, statCards: statCards.length, actionCards: actions.length, hero: Boolean(hero), story: Boolean(story), theme: name };
  }, { name: width.name, width: width.width });
}

async function auditPage(browser, state, url, width) {
  const context = await browser.newContext({
    viewport: { width: width.width, height: width.height }, isMobile: width.mobile, hasTouch: width.touch, storageState: state,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addInitScript(({ rail }) => {
    window.localStorage.setItem('streets.sidebar.rail.v1', rail ? '1' : '0');
  }, { rail: width.rail });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 160)));
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await dismissIntro(page);
  // Exercise the shell CSS independently of whether the audit account owns a
  // paid theme. This changes presentation only; permissions and page data still
  // come from the signed-in audit account.
  await page.evaluate((theme) => {
    const app = document.querySelector('.se-app');
    if (!app) return;
    for (const name of [...app.classList]) {
      if (name.startsWith('se-site-theme--')) app.classList.remove(name);
    }
    app.classList.add(`se-site-theme--${theme}`);
  }, width.theme);
  const finalPath = new URL(page.url()).pathname;
  const measured = await page.evaluate(measure, width.touch);
  const dashboard = DASHBOARD_ONLY && url === '/game' ? await checkDashboard(page, width) : null;
  const focus = width.width >= 1024 ? await focusCheck(page) : null;
  const axe = width.name !== 'phone-360' ? await axeCheck(page) : [];
  if (SHOTS) {
    mkdirSync(path.join(OUT, 'shots'), { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'shots', `${url.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${width.name}.png`), fullPage: true });
  }
  await context.close();
  return { url, finalPath, width: width.name, rail: width.rail, theme: width.theme, errors, ...measured, dashboard, focus, axe };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
});
const results = [];
try {
  const player = await signedIn(browser, process.env.UI_AUDIT_PLAYER, 'player');
  const admin = process.env.UI_AUDIT_ADMIN ? await signedIn(browser, process.env.UI_AUDIT_ADMIN, 'admin') : null;
  const anon = { cookies: [], origins: [] };
  const plan = [
    ...PUBLIC_PAGES.map((url) => [anon, url]),
    ...PLAYER_PAGES.map((url) => [player.state, url]),
    ...(admin ? [
      ...ADMIN_PAGES.map((url) => [admin.state, url]),
      ...(admin.extras.round ? [[admin.state, `/game/admin/rounds/${admin.extras.round}`]] : []),
      ...(admin.extras.account ? [[admin.state, `/game/admin/accounts/${admin.extras.account}`]] : []),
    ] : []),
  ].filter(([, url]) => (!DASHBOARD_ONLY || url === '/game') && (!ONLY || url.includes(ONLY)));
  for (const [state, url] of plan) {
    for (const width of WIDTHS) {
      const row = await auditPage(browser, state, url, width);
      await new Promise((resolve) => setTimeout(resolve, PACE_MS));
      results.push(row);
      const flags = [row.overflow ? 'OVERFLOW' : '', row.targets.fail.length ? `${row.targets.fail.length} tiny targets` : '',
        row.axe.length ? `${row.axe.reduce((n, v) => n + v.count, 0)} axe` : ''].filter(Boolean).join(', ');
      console.log(`${url.padEnd(34)} ${width.name.padEnd(9)} ${flags || 'ok'}`);
    }
  }
} finally {
  await browser.close();
}

// Report: failures first, grouped so one shared component shows up once.
const axeById = new Map();
for (const row of results) for (const v of row.axe) {
  const entry = axeById.get(v.id) ?? { ...v, pages: new Set(), count: 0 };
  entry.count += v.count;
  entry.pages.add(row.url);
  axeById.set(v.id, entry);
}
const overflowRows = results.filter((row) => row.overflow);
const targetRows = results.filter((row) => row.targets.fail.length);
const focusRows = results.filter((row) => row.focus && (row.focus.unringed.length || !row.focus.firstIsSkip));
const errorRows = results.filter((row) => row.errors.length);
const dashboardRows = results.filter((row) => row.dashboard?.issues.length);
const serious = [...axeById.values()].filter((v) => v.impact === 'serious' || v.impact === 'critical');
const lines = [
  '# UI audit', '', `${BASE} · ${new Date().toISOString()} · ${new Set(results.map((row) => row.url)).size} pages × ${WIDTHS.length} widths`, '',
  `| Check | Result |`, `| --- | --- |`,
  `| Sideways scrolling | ${overflowRows.length ? `${overflowRows.length} page/width(s)` : 'none'} |`,
  `| Targets under 24 px (phones) | ${targetRows.length ? `${targetRows.reduce((n, row) => n + row.targets.fail.length, 0)} on ${targetRows.length} page/width(s)` : 'none'} |`,
  `| Targets 24-43 px (phones, noted) | ${results.reduce((n, row) => n + row.targets.small, 0)} of ${results.reduce((n, row) => n + row.targets.total, 0)} |`,
  `| Keyboard focus | ${focusRows.length ? `${focusRows.length} page(s) with an unmarked stop or no skip link` : 'visible on every stop; skip link first'} |`,
  `| axe WCAG 2.2 AA | ${axeById.size ? `${[...axeById.values()].reduce((n, v) => n + v.count, 0)} findings in ${axeById.size} rule(s), ${serious.length} serious/critical` : 'no violations'} |`,
  `| Script errors | ${errorRows.length ? errorRows.length : 'none'} |`,
  `| Command Center layout | ${dashboardRows.length ? `${dashboardRows.length} widths require attention` : DASHBOARD_ONLY ? 'all six widths passed structure checks' : 'not specifically audited'} |`, '',
];
if (overflowRows.length) {
  lines.push('## Sideways scrolling', '');
  for (const row of overflowRows) lines.push(`- ${row.url} @ ${row.width}: page ${row.scrollWidth}px on ${row.viewport}px. ${row.wide.join('; ')}`);
  lines.push('');
}
if (targetRows.length) {
  lines.push('## Targets under 24 px', '');
  for (const row of targetRows) lines.push(`- ${row.url} @ ${row.width}: ${row.targets.fail.slice(0, 6).join('; ')}${row.targets.fail.length > 6 ? ` (+${row.targets.fail.length - 6})` : ''}`);
  lines.push('');
}
if (focusRows.length) {
  lines.push('## Keyboard focus', '');
  for (const row of focusRows) lines.push(`- ${row.url}: ${row.focus.firstIsSkip ? '' : 'first Tab is not "Skip to content". '}${row.focus.unringed.length ? `no visible focus on ${row.focus.unringed.join(', ')}` : ''}`);
  lines.push('');
}
if (axeById.size) {
  lines.push('## axe', '');
  for (const v of [...axeById.values()].sort((a, b) => b.count - a.count)) {
    lines.push(`- **${v.id}** (${v.impact}, ${v.count}×) ${v.help}. Pages: ${[...v.pages].slice(0, 6).join(', ')}${v.pages.size > 6 ? '…' : ''}. e.g. \`${v.targets[0] ?? ''}\``);
  }
  lines.push('');
}
if (errorRows.length) {
  lines.push('## Script errors', '');
  for (const row of errorRows) lines.push(`- ${row.url} @ ${row.width}: ${row.errors.join(' | ')}`);
}
if (dashboardRows.length) {
  lines.push('## Command Center layout', '');
  for (const row of dashboardRows) lines.push(`- ${row.width} / ${row.theme}: ${row.dashboard.issues.join('; ')}`);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'report.md'), `${lines.join('\n')}\n`);
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
console.log(`\n${lines.slice(4, 12).join('\n')}\n\nReport: ${path.join(OUT, 'report.md')}`);
const failed = overflowRows.length || targetRows.length || serious.length || focusRows.length || errorRows.length || dashboardRows.length;
if (STRICT && failed) process.exit(1);
