#!/usr/bin/env node
/**
 * 1.0.0-G. Mobile and accessibility audit of the game client, in a real browser.
 *
 *   npm run qa:ui -- [--base http://127.0.0.1:5173] [--out ./ui-audit] [--shots] [--strict] [--baseline|--responsive|--visual-smoke] [--deterministic] [--shard 1/6]
 *   npm run qa:ui -- --dashboard --shots --strict --base http://127.0.0.1:5173
 *   --dashboard audits the real signed-in Command Center at every selected width.
 *   --baseline limits the matrix to the 390/768/1440 Slice A reference widths.
 *   --responsive uses the Slice F acceptance widths: 360/390/768/1440, and
 *   exercises vertical scroll, mobile overlays, pull navigation and shared-shell retention.
 *   --visual-smoke uses a fast default/alternate/premium phone+desktop matrix.
 *   --deterministic fixes the audit clock/account, waits for fonts and pauses animation.
 *   --routes /game,/game/scout selects exact routes (unlike substring-based --only).
 *   --shard N/T splits the filtered route plan into T stable, interleaved batches.
 *   Use separate invocations for large matrices so server-wide API limits do not
 *   turn later pages into false script/focus failures.
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
const BASELINE_ONLY = args.includes('--baseline');
const RESPONSIVE = args.includes('--responsive');
const VISUAL_SMOKE = args.includes('--visual-smoke');
const DETERMINISTIC = args.includes('--deterministic');
const STRICT = args.includes('--strict');
const ONLY = option('only', '');
const ROUTES = option('routes', '').split(',').map((route) => route.trim()).filter(Boolean);
const SHARD_OPTION = option('shard', '');
const SHARD = (() => {
  if (!SHARD_OPTION) return null;
  const match = /^(\d+)\/(\d+)$/.exec(SHARD_OPTION);
  if (!match) throw new Error('--shard must use N/T syntax, for example --shard 1/6.');
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (index < 1 || total < 1 || index > total) throw new Error('--shard requires 1 <= N <= T.');
  return { index, total };
})();
// The development API has request throttles; three widths of every page in a row can trip them without a pause.
const PACE_MS = Number(option('pace', '900'));
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const WIDTHS = [
  { name: 'phone-360', width: 360, height: 740, mobile: true, touch: true, rail: false, theme: 'none', accent: 'default', density: 'comfortable' },
  { name: 'phone-390', width: 390, height: 844, mobile: true, touch: true, rail: false, theme: 'federal-case', accent: 'crimson', density: 'comfortable' },
  { name: 'tablet-768', width: 768, height: 1024, mobile: false, touch: true, rail: false, theme: 'midnight-market', accent: 'blue', density: 'compact' },
  { name: 'desktop-1024-expanded', width: 1024, height: 768, mobile: false, touch: false, rail: false, theme: 'casino-floor', accent: 'green', density: 'comfortable' },
  { name: 'desktop-1440-rail', width: 1440, height: 900, mobile: false, touch: false, rail: true, theme: 'federal-case', accent: 'gold', density: 'comfortable' },
  { name: 'desktop-1920-expanded', width: 1920, height: 1080, mobile: false, touch: false, rail: false, theme: 'midnight-market', accent: 'purple', density: 'compact' },
];
const VISUAL_SMOKE_WIDTHS = [
  { name: 'phone-390-default', width: 390, height: 844, mobile: true, touch: true, rail: false, theme: 'none', accent: 'default', density: 'comfortable' },
  { name: 'desktop-1440-alternate', width: 1440, height: 900, mobile: false, touch: false, rail: false, theme: 'midnight-market', accent: 'blue', density: 'comfortable' },
  { name: 'desktop-1440-premium', width: 1440, height: 900, mobile: false, touch: false, rail: true, theme: 'federal-case', accent: 'gold', density: 'compact' },
];
const AUDIT_WIDTHS = VISUAL_SMOKE ? VISUAL_SMOKE_WIDTHS : RESPONSIVE
  ? WIDTHS.filter(({ width }) => width === 360 || width === 390 || width === 768 || width === 1440)
  : BASELINE_ONLY ? WIDTHS.filter(({ width }) => width === 390 || width === 768 || width === 1440) : WIDTHS;

const PUBLIC_PAGES = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/join', '/dev/ui'];
const PLAYER_PAGES = [
  '/game', '/game/scout', '/game/produce', '/game/combat', '/game/quests', '/game/events', '/game/xp-progress', '/game/surveys', '/game/hideout',
  '/game/street-pass', '/game/collection', '/game/supporter',
  '/game/casino', '/game/casino/slots', '/game/casino/blackjack', '/game/casino/roulette', '/game/casino/street-dice', '/game/casino/poker', '/game/casino/sportsbook',
  '/game/products', '/game/stores', '/game/stores/pip', '/game/stores/charlie', '/game/stores/iron-maya',
  '/game/supply', '/game/holdings', '/game/loans', '/game/dealers', '/game/crew',
  '/game/travel', '/game/turf', '/game/operations', '/game/black-book', '/game/rankings', '/game/players',
  '/game/alliance', '/game/alliances', '/game/contacts', '/game/console', '/game/profile',
  '/game/news', '/game/status', '/game/rules', '/game/report-bug', '/game/hall-of-fame', '/game/round-archive',
  '/game/blocks', '/game/cities', '/game/activity', '/game/reputation', '/account', '/account/forum-link',
];
const ADMIN_PAGES = [
  '/game/admin', '/game/admin/rounds', '/game/admin/monitoring', '/game/admin/news', '/game/admin/accounts', '/game/admin/supporters',
  '/game/admin/quests', '/game/admin/surveys', '/game/admin/integrations', '/game/admin/rulesets', '/game/admin/signals',
  '/game/admin/audit', '/game/admin/events', '/game/admin/reports', '/game/admin/bugs', '/game/admin/crew',
  '/game/admin/economy', '/game/admin/supply', '/game/admin/loans', '/game/admin/casino', '/game/admin/factions',
  '/game/admin/vehicles', '/game/admin/law', '/game/admin/combat', '/game/admin/turf',
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
    username = DETERMINISTIC ? `uiAuditVisual${label}` : `audit${Math.random().toString(36).slice(2, 8)}`;
    password = `password-${username}`;
    const made = await api(context, 'POST', '/api/auth/register', { ageConfirmed: true, birthDate: '1990-01-01', username, email: `${username}@example.invalid`, password });
    if (made.status >= 300) {
      const login = DETERMINISTIC ? await api(context, 'POST', '/api/auth/login', { identifier: username, password }) : null;
      if (!login || login.status >= 300) throw new Error(`could not register an audit player (${made.status} ${made.body?.error?.code ?? ''}); set UI_AUDIT_PLAYER.`);
    }
    await api(context, 'POST', '/api/rounds/current/join', {});
  } else {
    const login = await api(context, 'POST', '/api/auth/login', { identifier: username, password });
    if (login.status >= 300) throw new Error(`${label} could not sign in as ${username} (${login.status}).`);
  }
  const state = await context.storageState();
  const extras = {};
  if (label === 'player') {
    const directory = await api(context, 'GET', '/api/game/players?view=all&page=1');
    const profile = directory.body?.players?.[0];
    if (profile?.publicPimpId) extras.publicPimpId = profile.publicPimpId;
    const alliances = await api(context, 'GET', '/api/game/alliances');
    const alliance = alliances.body?.alliances?.[0];
    if (alliance?.tag) extras.allianceTag = alliance.tag;
    const archive = await api(context, 'GET', '/api/rounds/aftermath/archive?page=1&pageSize=10&order=newest');
    const round = archive.body?.rounds?.find((row) => row.reportStatus === 'READY');
    if (round?.id) extras.aftermathRound = round.id;
  } else if (label === 'admin') {
    const rounds = await api(context, 'GET', '/api/admin/rounds');
    const round = rounds.body?.rounds?.find((row) => row.status === 'ACTIVE') ?? rounds.body?.rounds?.[0];
    if (round) {
      extras.round = round.id;
      const health = await api(context, 'GET', `/api/admin/rounds/${encodeURIComponent(round.id)}/health`);
      const player = health.body?.topPlayers?.[0];
      if (player?.roundPlayerId) extras.player = player.roundPlayerId;
    }
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
    return run.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      count: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      details: v.nodes.slice(0, 3).map((n) => ({
        target: n.target.join(' '),
        html: n.html.slice(0, 240),
        summary: n.failureSummary,
      })),
    }));
  });
  return result;
}

function percentile(values, percent) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)];
}

async function performanceCheck(page, readyMs) {
  return page.evaluate((routeReadyMs) => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const vitals = window.__seUiAuditVitals ?? { cls: 0, lcp: 0, longTaskCount: 0, longTaskTotal: 0, longTaskMax: 0, layoutShifts: [] };
    return {
      routeReadyMs,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
      loadMs: navigation?.loadEventEnd ?? 0,
      transferBytes: navigation?.transferSize ?? 0,
      cls: Number(vitals.cls.toFixed(4)),
      lcpMs: Math.round(vitals.lcp),
      longTaskCount: vitals.longTaskCount,
      longTaskTotalMs: Math.round(vitals.longTaskTotal),
      longTaskMaxMs: Math.round(vitals.longTaskMax),
      layoutShifts: vitals.layoutShifts,
    };
  }, readyMs);
}

async function responsiveLayoutCheck(page) {
  return page.evaluate(async () => {
    const issues = [];
    const scrolling = document.scrollingElement;
    const startY = window.scrollY;
    const maxY = scrolling ? Math.max(0, scrolling.scrollHeight - window.innerHeight) : 0;
    let verticalScroll = 'not-needed';
    if (maxY > 80) {
      window.scrollTo(0, Math.min(220, maxY));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      verticalScroll = window.scrollY > startY + 20 ? 'passed' : 'failed';
      if (verticalScroll === 'failed') issues.push('Document did not scroll vertically after idle.');
      window.scrollTo(0, startY);
    }

    const visible = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const tabbar = document.querySelector('.se-tabbar');
    const tabbarBox = tabbar && visible(tabbar) ? tabbar.getBoundingClientRect() : null;
    const sticky = [];
    for (const element of document.querySelectorAll('.se-dock, .se-action-footer--sticky')) {
      if (!visible(element)) continue;
      const returnY = window.scrollY;
      element.scrollIntoView({ block: 'end' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      let box = element.getBoundingClientRect();
      if (tabbarBox && box.bottom > tabbarBox.top + 1) {
        // `scrollIntoView({block:'end'})` aligns the element with the physical
        // viewport edge and can bypass the sticky inset. Verify that the user
        // can move it fully above fixed mobile navigation instead.
        window.scrollBy(0, box.bottom - tabbarBox.top + 2);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        box = element.getBoundingClientRect();
      }
      const style = getComputedStyle(element);
      const clear = !tabbarBox || box.bottom <= tabbarBox.top + 1;
      sticky.push({
        className: element.className,
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        tabbarTop: tabbarBox ? Math.round(tabbarBox.top) : null,
        computedBottom: style.bottom,
        mobileStickyOffset: style.getPropertyValue('--se-mobile-sticky-offset').trim(),
        clear,
      });
      if (!clear) issues.push(`Sticky action overlaps the mobile tabbar (${element.className}).`);
      window.scrollTo(0, returnY);
    }

    let containedHorizontalScrollers = 0;
    for (const element of document.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      if (!/(auto|scroll)/.test(style.overflowX) || element.scrollWidth <= element.clientWidth + 1 || !visible(element)) continue;
      containedHorizontalScrollers++;
      const box = element.getBoundingClientRect();
      if (box.left < -1 || box.right > window.innerWidth + 1) issues.push(`Contained horizontal scroller escapes the viewport (${element.className || element.tagName}).`);
    }
    return { issues, verticalScroll, maxY: Math.round(maxY), sticky, containedHorizontalScrollers };
  });
}

async function mobileShellCheck(page) {
  const issues = [];
  await page.evaluate(() => window.scrollTo(0, 0));

  const dispatchPull = (endY) => page.evaluate((finishY) => {
    const target = document.querySelector('.se-gamemain');
    if (!target) return false;
    const emit = (type, touches, changedTouches = []) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: touches });
      Object.defineProperty(event, 'changedTouches', { value: changedTouches });
      target.dispatchEvent(event);
    };
    const start = { identifier: 71, clientX: 170, clientY: 180 };
    const end = { identifier: 71, clientX: 174, clientY: finishY };
    emit('touchstart', [start]);
    emit('touchmove', [end]);
    emit('touchend', [], [end]);
    return true;
  }, endY);

  if (!await dispatchPull(240)) issues.push('Game content was not available for pull navigation.');
  await page.waitForTimeout(80);
  if (await page.locator('.se-sheet').count()) issues.push('A short ordinary drag opened All pages.');

  await dispatchPull(300);
  await page.waitForTimeout(100);
  const pulledOpen = await page.locator('.se-sheet--from-top').count() === 1;
  if (!pulledOpen) {
    issues.push('A deliberate pull-down did not open All pages from the top.');
  } else {
    const lock = await page.evaluate(() => ({ root: document.documentElement.style.overflow, body: document.body.style.overflow, position: document.body.style.position }));
    if (lock.root !== 'hidden' || lock.body !== 'hidden' || lock.position !== 'fixed') issues.push('All pages did not fully lock the document behind it.');
    const sheetScroll = await page.locator('.se-sheet__body').evaluate((element) => {
      const scrollable = element.scrollHeight > element.clientHeight + 1;
      if (scrollable) element.scrollTop = Math.min(120, element.scrollHeight - element.clientHeight);
      return { scrollable, moved: !scrollable || element.scrollTop > 0 };
    });
    if (!sheetScroll.moved) issues.push('All pages trapped vertical scrolling outside its directory body.');
    await page.locator('.se-sheet__close').click();
    await page.waitForTimeout(80);
  }

  await page.evaluate(() => window.scrollTo(0, Math.min(180, Math.max(0, document.documentElement.scrollHeight - innerHeight))));
  const beforeOverlayY = await page.evaluate(() => window.scrollY);
  const more = page.locator('button.se-tabbar__tab', { hasText: 'More' });
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(80);
    await page.locator('.se-sheet__close').click();
    await page.waitForTimeout(80);
    const restored = await page.evaluate(() => ({ y: window.scrollY, root: document.documentElement.style.overflow, body: document.body.style.overflow, position: document.body.style.position }));
    if (Math.abs(restored.y - beforeOverlayY) > 2 || restored.root === 'hidden' || restored.body === 'hidden' || restored.position === 'fixed') {
      issues.push('Closing All pages did not restore document scrolling and position.');
    }
  } else {
    issues.push('Mobile More navigation was not available.');
  }

  const nextTab = page.locator('a.se-tabbar__tab:not([aria-current="page"])').first();
  let tabSwitchScroll = 'not-tested';
  if (await nextTab.count()) {
    await nextTab.click();
    await page.waitForTimeout(500);
    tabSwitchScroll = await page.evaluate(async () => {
      if (document.body.style.position === 'fixed' || document.documentElement.style.overflow === 'hidden') return 'locked';
      const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      if (max < 40) return 'not-needed';
      window.scrollTo(0, Math.min(160, max));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return window.scrollY > 20 ? 'passed' : 'failed';
    });
    if (tabSwitchScroll === 'locked' || tabSwitchScroll === 'failed') issues.push('Vertical scrolling did not recover after switching mobile tabs.');
  }
  return { issues, pulledOpen, beforeOverlayY, tabSwitchScroll };
}

async function routeRetentionCheck(page, url) {
  const selector = url === '/game/stores/pip'
    ? '.se-storetabs__tab:not(.se-storetabs__tab--active)'
    : url === '/game/casino/slots' ? '.se-casino-switch__game:not(.is-active)' : null;
  if (!selector) return null;
  const link = page.locator(selector).first();
  if (!await link.count()) return { issues: [`Shared-shell destination was unavailable for ${url}.`] };
  const before = await page.evaluate(() => {
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    window.scrollTo(0, Math.min(240, max));
    return window.scrollY;
  });
  // Playwright's locator.click() scrolls an offscreen navigation link into
  // view first, which would manufacture a jump before the app handles the
  // route. Dispatch the real DOM click at the current scroll position.
  await link.evaluate((element) => element.click());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.scrollY);
  return { before, after, issues: Math.abs(after - before) <= 12 ? [] : [`Shared-shell switch moved the page from ${before}px to ${after}px.`] };
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
  await page.addInitScript(({ rail, deterministic }) => {
    window.localStorage.setItem('streets.sidebar.rail.v1', rail ? '1' : '0');
    if (deterministic) {
      const fixedEpoch = Date.parse('2030-01-15T12:00:00.000Z');
      const NativeDate = Date;
      class AuditDate extends NativeDate {
        constructor(...values) { super(...(values.length ? values : [fixedEpoch])); }
        static now() { return fixedEpoch; }
      }
      Object.setPrototypeOf(AuditDate, NativeDate);
      window.Date = AuditDate;
    }
    window.__seUiAuditVitals = { cls: 0, lcp: 0, longTaskCount: 0, longTaskTotal: 0, longTaskMax: 0, layoutShifts: [] };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) {
          window.__seUiAuditVitals.cls += entry.value;
          const sources = [...(entry.sources ?? [])].slice(0, 3).map((source) => {
            const node = source.node;
            if (!(node instanceof Element)) return 'unknown';
            return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${[...node.classList].slice(0, 2).map((name) => `.${name}`).join('')}`;
          });
          window.__seUiAuditVitals.layoutShifts.push({ value: Number(entry.value.toFixed(4)), sources });
          window.__seUiAuditVitals.layoutShifts.sort((a, b) => b.value - a.value);
          window.__seUiAuditVitals.layoutShifts.length = Math.min(8, window.__seUiAuditVitals.layoutShifts.length);
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) window.__seUiAuditVitals.lcp = entries[entries.length - 1].startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__seUiAuditVitals.longTaskCount++;
          window.__seUiAuditVitals.longTaskTotal += entry.duration;
          window.__seUiAuditVitals.longTaskMax = Math.max(window.__seUiAuditVitals.longTaskMax, entry.duration);
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* Older webviews still receive navigation and route-ready timings. */ }
  }, { rail: width.rail, deterministic: DETERMINISTIC });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 160)));
  const started = Date.now();
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await dismissIntro(page);
  await page.evaluate(async (deterministic) => {
    await document.fonts?.ready;
    if (!deterministic) return;
    const style = document.createElement('style');
    style.dataset.uiAuditDeterministic = 'true';
    style.textContent = `*, *::before, *::after { animation-delay: 0s !important; animation-duration: 0s !important; caret-color: transparent !important; transition-delay: 0s !important; transition-duration: 0s !important; }`;
    document.head.append(style);
  }, DETERMINISTIC);
  const readyMs = Date.now() - started;
  // Exercise the shell CSS independently of whether the audit account owns a
  // paid theme. This changes presentation only; permissions and page data still
  // come from the signed-in audit account.
  await page.evaluate(({ theme, accent, density }) => {
    const app = document.querySelector('.se-app');
    if (!app) return;
    for (const name of [...app.classList]) {
      if (name.startsWith('se-site-theme--') || name.startsWith('se-site-accent--') || name.startsWith('se-density--')) app.classList.remove(name);
    }
    app.classList.add(`se-site-theme--${theme}`);
    app.classList.add(`se-site-accent--${accent}`);
    app.classList.add(`se-density--${density}`);
  }, { theme: width.theme, accent: width.accent, density: width.density });
  const finalPath = new URL(page.url()).pathname;
  const measured = await page.evaluate(measure, width.touch);
  const performance = await performanceCheck(page, readyMs);
  const responsive = RESPONSIVE ? await responsiveLayoutCheck(page) : null;
  const dashboard = DASHBOARD_ONLY && url === '/game' ? await checkDashboard(page, width) : null;
  const focus = width.width >= 1024 ? await focusCheck(page) : null;
  const axe = width.name !== 'phone-360' ? await axeCheck(page) : [];
  if (SHOTS) {
    mkdirSync(path.join(OUT, 'shots'), { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'shots', `${url.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${width.name}.png`), fullPage: true });
  }
  const mobileShell = RESPONSIVE && url === '/game' && width.width <= 390 ? await mobileShellCheck(page) : null;
  const retention = RESPONSIVE && width.width === 390 ? await routeRetentionCheck(page, url) : null;
  await context.close();
  return { url, finalPath, width: width.name, rail: width.rail, theme: width.theme, accent: width.accent, density: width.density, deterministic: DETERMINISTIC, errors, ...measured, dashboard, focus, axe, performance, responsive, mobileShell, retention };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
});
const results = [];
try {
  const player = await signedIn(browser, process.env.UI_AUDIT_PLAYER, 'player');
  const admin = process.env.UI_AUDIT_ADMIN ? await signedIn(browser, process.env.UI_AUDIT_ADMIN, 'admin') : null;
  const anon = { cookies: [], origins: [] };
  const fullPlan = [
    ...PUBLIC_PAGES.map((url) => [anon, url]),
    ...PLAYER_PAGES.map((url) => [player.state, url]),
    ...(player.extras.publicPimpId ? [[player.state, `/game/players/${player.extras.publicPimpId}`]] : []),
    ...(player.extras.allianceTag ? [[player.state, `/game/alliances/${encodeURIComponent(player.extras.allianceTag)}`]] : []),
    ...(player.extras.aftermathRound ? [[player.state, `/game/rounds/${player.extras.aftermathRound}/aftermath`]] : []),
    ...(admin ? [
      ...ADMIN_PAGES.map((url) => [admin.state, url]),
      ...(admin.extras.round ? [[admin.state, `/game/admin/rounds/${admin.extras.round}`]] : []),
      ...(admin.extras.account ? [[admin.state, `/game/admin/accounts/${admin.extras.account}`]] : []),
      ...(admin.extras.player ? [
        [admin.state, `/game/admin/players/${admin.extras.player}`],
        [admin.state, `/game/admin/players/${admin.extras.player}/law`],
      ] : []),
    ] : []),
  ].filter(([, url]) => (!DASHBOARD_ONLY || url === '/game') && (!ONLY || url.includes(ONLY)) && (!ROUTES.length || ROUTES.includes(url)));
  const plan = SHARD
    ? fullPlan.filter((_, routeIndex) => routeIndex % SHARD.total === SHARD.index - 1)
    : fullPlan;
  for (const [state, url] of plan) {
    for (const width of AUDIT_WIDTHS) {
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
const responsiveRows = results.filter((row) => row.responsive?.issues.length || row.mobileShell?.issues.length || row.retention?.issues.length);
const serious = [...axeById.values()].filter((v) => v.impact === 'serious' || v.impact === 'critical');
const readyValues = results.map((row) => row.performance.routeReadyMs);
const dclValues = results.map((row) => row.performance.domContentLoadedMs);
const lcpValues = results.map((row) => row.performance.lcpMs);
const clsValues = results.map((row) => row.performance.cls);
const longTaskValues = results.map((row) => row.performance.longTaskMaxMs);
const lines = [
  '# UI audit', '', `${BASE} · ${new Date().toISOString()} · ${new Set(results.map((row) => row.url)).size} pages × ${AUDIT_WIDTHS.length} widths${SHARD ? ` · shard ${SHARD.index}/${SHARD.total}` : ''}${DETERMINISTIC ? ' · deterministic capture' : ''}`, '',
  `| Check | Result |`, `| --- | --- |`,
  `| Sideways scrolling | ${overflowRows.length ? `${overflowRows.length} page/width(s)` : 'none'} |`,
  `| Targets under 24 px (touch viewports) | ${targetRows.length ? `${targetRows.reduce((n, row) => n + row.targets.fail.length, 0)} on ${targetRows.length} page/width(s)` : 'none'} |`,
  `| Targets 24-43 px (touch viewports, noted) | ${results.reduce((n, row) => n + row.targets.small, 0)} of ${results.reduce((n, row) => n + row.targets.total, 0)} |`,
  `| Keyboard focus | ${focusRows.length ? `${focusRows.length} page(s) with an unmarked stop or no skip link` : 'visible on every stop; skip link first'} |`,
  `| axe WCAG 2.2 AA | ${axeById.size ? `${[...axeById.values()].reduce((n, v) => n + v.count, 0)} findings in ${axeById.size} rule(s), ${serious.length} serious/critical` : 'no violations'} |`,
  `| Script errors | ${errorRows.length ? errorRows.length : 'none'} |`,
  `| Responsive interactions | ${RESPONSIVE ? responsiveRows.length ? `${responsiveRows.length} page/width(s) require attention` : 'all exercised interactions passed' : 'not exercised (use --responsive)'} |`,
  `| Audit settled (local p50 / p95) | ${Math.round(percentile(readyValues, .5))} ms / ${Math.round(percentile(readyValues, .95))} ms |`,
  `| DOMContentLoaded (p50 / p95) | ${Math.round(percentile(dclValues, .5))} ms / ${Math.round(percentile(dclValues, .95))} ms |`,
  `| LCP observed (p50 / p95) | ${Math.round(percentile(lcpValues, .5))} ms / ${Math.round(percentile(lcpValues, .95))} ms |`,
  `| CLS (p95 / max) | ${percentile(clsValues, .95).toFixed(4)} / ${Math.max(0, ...clsValues).toFixed(4)} |`,
  `| Long task max (p95 / max) | ${Math.round(percentile(longTaskValues, .95))} ms / ${Math.round(Math.max(0, ...longTaskValues))} ms |`,
  `| Command Center layout | ${dashboardRows.length ? `${dashboardRows.length} widths require attention` : DASHBOARD_ONLY ? `all ${AUDIT_WIDTHS.length} audited widths passed structure checks` : 'not specifically audited'} |`, '',
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
if (responsiveRows.length) {
  lines.push('## Responsive interactions', '');
  for (const row of responsiveRows) {
    const issues = [...(row.responsive?.issues ?? []), ...(row.mobileShell?.issues ?? []), ...(row.retention?.issues ?? [])];
    lines.push(`- ${row.url} @ ${row.width}: ${issues.join('; ')}`);
  }
  lines.push('');
}
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'report.md'), `${lines.join('\n')}\n`);
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
console.log(`\n${lines.slice(4, 14).join('\n')}\n\nReport: ${path.join(OUT, 'report.md')}`);
const failed = overflowRows.length || targetRows.length || serious.length || focusRows.length || errorRows.length || dashboardRows.length || responsiveRows.length;
if (STRICT && failed) process.exit(1);
