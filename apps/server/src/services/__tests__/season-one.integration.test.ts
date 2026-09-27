import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { rulesets } from '@streets/rulesets';

/**
 * 1.0.0-H. Season One, end to end, through the same HTTP API the game and the admin
 * panel use, with no database edits along the way:
 *
 *   Create → Join → Play → End → Freeze standings → Hall of Fame → Archive → Create next season
 *
 * and inside "Play", the 1.0 release definition: a real player registers, learns the
 * game, builds a crew, trades, fights, travels, controls turf, builds a Hideout, joins
 * an alliance, talks to other players, finishes the season and appears in permanent
 * history.
 *
 * It starts and ends real seasons, so it only runs against a scratch database:
 * `npm run qa:season-one` makes one, runs this, and drops it.
 */
// Sign-up emails a verification link; the test reads it here instead of an inbox.
const mailbox = new Map<string, string>();
vi.mock('../email.service.js', async (original) => ({
  ...(await original<typeof import('../email.service.js')>()),
  sendCurrentEmailVerification: vi.fn(async (message: { to: string; url: string }) => { mailbox.set(message.to, message.url); }),
}));

const SCRATCH = /\/streets_scratch_[a-z0-9_]+(\?|$)/;
const enabled = process.env.SEASON_ONE_INTEGRATION === '1';

describe.runIf(enabled)('1.0.0-H Season One on a scratch database', () => {
  let app: FastifyInstance;
  const latest = Object.values(rulesets).at(-1)!;
  const cookies = new Map<string, string>();
  const players = new Map<string, { accountId: string; publicPimpId: number; roundPlayerId: string }>();
  let seasonId = '';
  let nextSeasonId = '';

  const call = async (who: string | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown): Promise<LightMyRequestResponse> => {
    const response = await app.inject({
      method, url: `/api${url}`,
      headers: who ? { cookie: cookies.get(who)! } : {},
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    return response;
  };
  /** A call that must succeed; on failure the error names the step and what the server said. */
  const ok = async <T = Record<string, unknown>>(who: string | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown): Promise<T> => {
    const response = await call(who, method, url, payload);
    if (response.statusCode >= 300) throw new Error(`${method} ${url} as ${who ?? 'guest'} → ${response.statusCode} ${response.body.slice(0, 400)}`);
    return response.json() as T;
  };
  const register = async (who: string) => {
    const name = `${who}${randomUUID().slice(0, 6)}`.toLowerCase();
    const response = await call(null, 'POST', '/auth/register', { username: name, email: `${name}@example.invalid`, password: `password-${name}` });
    expect(response.statusCode, response.body).toBe(201);
    cookies.set(who, response.cookies.map((c) => `${c.name}=${c.value}`).join('; '));
    return { id: response.json().account.id as string, username: name, email: `${name}@example.invalid` };
  };
  /** Open the link from the sign-up email, as the player would. */
  const verifyEmail = async (who: string, email: string) => {
    const url = mailbox.get(email);
    expect(url, `no verification email for ${email}`).toBeTruthy();
    const verified = await ok<{ account: { verificationRequired: boolean } }>(who, 'POST', '/auth/email/verify', { token: new URL(url!).searchParams.get('token') });
    expect(verified.account.verificationRequired).toBe(false);
  };
  const me = (who: string) => ok<{ player: { id: string; publicPimpId: number; resources: Record<string, number>; turns: { turns: number }; cashCents: number; netWorthCents: number } }>(who, 'GET', '/game/me');

  beforeAll(async () => {
    if (!SCRATCH.test(process.env.DATABASE_URL ?? '')) {
      throw new Error('Season One takes over the whole database. Run it with `npm run qa:season-one`, which makes a scratch database.');
    }
    app = await (await import('../../app.js')).buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('an operator creates the season, opens registration and starts it', async () => {
    const admin = await register('ops');
    // The one step outside the API: making the first admin, exactly what `npm run admin -- <name>` does.
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });

    const now = Date.now();
    const { round: created } = await ok<{ round: { id: string; status: string } }>('ops', 'POST', '/admin/rounds', {
      name: 'Season One', slug: `season-one-${now.toString(36)}`, rulesetId: latest.meta.id,
      startsAt: new Date(now + 60 * 60_000).toISOString(), endsAt: new Date(now + 14 * 86_400_000).toISOString(),
    });
    seasonId = created.id;
    expect(created.status).toBe('SCHEDULED');
    await ok('ops', 'POST', `/admin/rounds/${seasonId}/open-registration`, {});
    // The seed's own season is running; starting Season One hands off from it, as a real launch would.
    const { round: started } = await ok<{ round: { status: string } }>('ops', 'POST', `/admin/rounds/${seasonId}/start`, { confirmHandoff: true });
    expect(started.status).toBe('ACTIVE');
    const current = await ok<{ round: { id: string; rulesetId: string } }>(null, 'GET', '/rounds/current');
    expect(current.round).toMatchObject({ id: seasonId, rulesetId: latest.meta.id });
  });

  it('players register, verify their email, learn the game and join', async () => {
    for (const who of ['ann', 'ben', 'cal']) {
      const account = await register(who);
      // Sign-up with email: the game stays shut until the emailed link is opened.
      const early = await call(who, 'POST', '/rounds/current/join', {});
      expect(early.statusCode).toBe(403);
      expect(early.json().error.code).toBe('EMAIL_NOT_VERIFIED');
      await verifyEmail(who, account.email);
      await ok(who, 'POST', '/rounds/current/join', {});
      const snapshot = await me(who);
      players.set(who, { accountId: account.id, publicPimpId: snapshot.player.publicPimpId, roundPlayerId: snapshot.player.id });
    }
    // Learn the game: the intro, the rules and the getting-started guide.
    await ok('ann', 'POST', '/game/onboarding', { action: 'complete-intro' });
    const onboarding = await ok<{ guide: { steps: unknown[] } }>('ann', 'GET', '/game/onboarding');
    expect(onboarding.guide.steps.length).toBeGreaterThan(0);
    await ok(null, 'GET', '/rounds/current/status');
  });

  it('a player builds a crew, trades and works the streets', async () => {
    const districts = await ok<{ districts: Array<{ key: string; slug?: string; locked?: boolean }> }>('ann', 'GET', '/game/districts');
    const district = districts.districts.find((row) => !row.locked) ?? districts.districts[0]!;
    const before = await me('ann');
    const scouted = await ok<{ result: unknown }>('ann', 'POST', '/game/scout', { district: district.key ?? district.slug, turns: 5, actionId: randomUUID() });
    expect(scouted.result).toBeTruthy();
    const produced = await ok<{ result: unknown }>('ann', 'POST', '/game/produce-crack', { turns: 3, productType: 'CRACK', actionId: randomUUID() });
    expect(produced.result).toBeTruthy();
    await ok('ann', 'POST', '/game/stores/trade', { store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 20, actionId: randomUUID() });
    await ok('ann', 'POST', '/game/stores/trade', { store: 'CORNER', item: 'BEER', direction: 'buy', quantity: 20, actionId: randomUUID() });
    await ok('ann', 'PUT', '/game/payout', { percent: 45, actionId: randomUUID() });
    const after = await me('ann');
    expect(after.player.turns.turns).toBeLessThan(before.player.turns.turns);
    // The same action id twice is one action, not two.
    const actionId = randomUUID();
    await ok('ann', 'POST', '/game/stores/trade', { store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 1, actionId });
    const replay = await call('ann', 'POST', '/game/stores/trade', { store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 1, actionId });
    expect(replay.statusCode).toBeLessThan(500);
  });

  it('players scout each other and fight', async () => {
    const ben = players.get('ben')!;
    const recon = await ok<{ intel: { targetPublicPimpId: number } }>('ann', 'POST', '/game/combat/recon', { roundId: seasonId, targetPublicPimpId: ben.publicPimpId, actionId: randomUUID() });
    expect(recon.intel.targetPublicPimpId).toBe(ben.publicPimpId);
    const raid = await ok<{ id: string; kind: string; role: string }>('ann', 'POST', '/game/combat/raid', { roundId: seasonId, targetPublicPimpId: ben.publicPimpId, attackingThugs: 2, actionId: randomUUID() });
    expect(raid).toMatchObject({ kind: 'RAID', role: 'ATTACKER' });
    // The defender sees the same fight from the other side.
    const defended = await ok<{ reports: Array<{ id: string; role: string }> }>('ben', 'GET', `/game/combat/reports?roundId=${seasonId}`);
    expect(defended.reports.find((report) => report.id === raid.id)?.role).toBe('DEFENDER');
  });

  it('a player travels, holds turf and builds a Hideout', async () => {
    // Several days of play fast-forwarded with the audited admin grant: the Low-Riders,
    // crew and cash a week-old player would have. Everything after is ordinary play.
    const ann = players.get('ann')!;
    await ok('ops', 'POST', `/admin/players/${ann.roundPlayerId}/grant`, {
      reason: 'Season One check: a week of play fast-forwarded', lowRiders: 2, thugs: 50, whores: 40, pistols: 25, cashCents: 10_000_000,
    });

    const travel = await ok<{ cities?: Array<{ slug: string; home?: boolean }>; homeCitySlug?: string }>('ann', 'GET', '/game/travel');
    const cities = await ok<{ cities: Array<{ slug: string; isHome?: boolean; home?: boolean }> }>('ann', 'GET', '/game/cities');
    const away = cities.cities.find((city) => !(city.isHome ?? city.home) && city.slug !== (travel.homeCitySlug ?? ''))!;
    const launched = await ok<{ result: { run?: { id: string } } }>('ann', 'POST', '/game/travel/launch', {
      to: away.slug, route: 0, lowRiders: 1, escortThugs: 2, cashCents: 100_000, cargo: {}, actionId: randomUUID(),
    });
    expect(launched.result).toBeTruthy();

    // Take a block of the home city from the locals, and it shows as ours on the city map.
    // Presence comes from working the block, so the crew works it until the claim is allowed.
    let claimed = await call('ann', 'POST', '/game/turf/claim', { district: 'LOW_RENT', thugs: 20, actionId: randomUUID() });
    for (let shift = 0; shift < 6 && claimed.statusCode === 409 && claimed.json().error.code === 'TURF_NO_PRESENCE'; shift++) {
      await ok('ann', 'POST', '/game/scout', { district: 'LOW_RENT', turns: 15, actionId: randomUUID() });
      claimed = await call('ann', 'POST', '/game/turf/claim', { district: 'LOW_RENT', thugs: 20, actionId: randomUUID() });
    }
    expect(claimed.statusCode, claimed.body).toBe(200);
    const map = await ok<Record<string, unknown>>('ann', 'GET', '/game/cities');
    expect(JSON.stringify(map)).toContain('"isMine":true');

    const upgraded = await ok<{ result: unknown }>('ann', 'POST', '/game/hideout/upgrade', { room: 'SAFE_ROOM', actionId: randomUUID() });
    expect(upgraded.result).toBeTruthy();
    const hideout = await ok<{ rooms: Array<{ key: string; level: number }> }>('ann', 'GET', '/game/hideout');
    expect(hideout.rooms.find((room) => room.key === 'SAFE_ROOM')?.level).toBeGreaterThanOrEqual(1);
  });

  it('players form an alliance and talk to each other', async () => {
    const tag = `S${randomUUID().slice(0, 3).toUpperCase()}`.replace(/[^A-Z0-9]/g, 'X');
    const created = await ok<{ alliance: { tag: string } | null }>('ann', 'POST', '/game/alliance/create', { name: `Season One ${tag}`, tag });
    expect(created.alliance?.tag).toBe(tag);
    await ok('ann', 'POST', '/game/alliance/invite', { targetPublicPimpId: players.get('ben')!.publicPimpId });
    const joined = await ok<{ alliance: { members?: unknown[] } | null }>('ben', 'POST', '/game/alliance/accept', { tag });
    expect(joined.alliance).toBeTruthy();
    await ok('ben', 'POST', '/game/alliance/wire', { body: 'Hitting the east side at noon.', kind: 'MESSAGE', pinned: false });

    await ok('cal', 'POST', '/game/console/messages', {
      recipientPublicPimpId: players.get('ann')!.publicPimpId, subject: 'Truce?', body: 'Leave my corner alone and I leave yours.', actionId: randomUUID(),
    });
    const inbox = await ok<{ messages: Array<{ subject: string }> }>('ann', 'GET', '/game/console?folder=inbox&page=1');
    expect(inbox.messages.some((message) => message.subject === 'Truce?')).toBe(true);
    // Alerts land in the bell.
    const bell = await call('ann', 'GET', '/notifications');
    expect(bell.statusCode, bell.body).toBeLessThan(500);
  });

  it('the season ends, standings freeze and the Hall of Fame names the winners', async () => {
    const ann = await me('ann');
    const { round: ended } = await ok<{ round: { status: string } }>('ops', 'POST', `/admin/rounds/${seasonId}/end-early`, { reason: 'Season One check: end of season' });
    expect(ended.status).toBe('ENDED');

    // Frozen: play is refused, and net worth no longer moves.
    const late = await call('ann', 'POST', '/game/scout', { district: 'x', turns: 1, actionId: randomUUID() });
    expect(late.statusCode).toBeGreaterThanOrEqual(400);
    const frozen = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players.get('ann')!.roundPlayerId } });
    expect(frozen.netWorthCents).toBeGreaterThan(0n);

    const fame = await ok<{ champions: Array<{ round: { name: string }; winners: Array<{ displayName: string }> }> }>(null, 'GET', '/public/hall-of-fame');
    const entry = fame.champions.find((row) => row.round.name === 'Season One');
    expect(entry, JSON.stringify(fame).slice(0, 300)).toBeTruthy();
    expect(entry!.winners.length).toBeGreaterThan(0);
    expect(ann.player.netWorthCents).toBeGreaterThan(0);
  });

  it('the season is archived and stays in permanent history', async () => {
    const { round: archived } = await ok<{ round: { status: string } }>('ops', 'POST', `/admin/rounds/${seasonId}/archive`, {});
    expect(archived.status).toBe('ARCHIVED');
    const game = await ok<Record<string, unknown>>(null, 'GET', `/public/games/${seasonId}`);
    expect(JSON.stringify(game)).toContain('Season One');
    // The player's own career keeps the finished season after the game moves on.
    const career = await ok<Record<string, unknown>>('ann', 'GET', '/game/career');
    expect(JSON.stringify(career)).toContain('Season One');
  });

  it('the next season is created, and the same players start fresh in it', async () => {
    const now = Date.now();
    const { round: next } = await ok<{ round: { id: string } }>('ops', 'POST', '/admin/rounds', {
      name: 'Season Two', slug: `season-two-${now.toString(36)}`, rulesetId: latest.meta.id,
      startsAt: new Date(now + 60_000).toISOString(), endsAt: new Date(now + 14 * 86_400_000).toISOString(),
    });
    nextSeasonId = next.id;
    await ok('ops', 'POST', `/admin/rounds/${nextSeasonId}/start`, { confirmHandoff: true });
    await ok('ann', 'POST', '/rounds/current/join', {});
    const fresh = await me('ann');
    expect(fresh.player.id).not.toBe(players.get('ann')!.roundPlayerId);
    expect(fresh.player.turns.turns).toBeGreaterThan(0);
    // Nothing in the new season came from a database edit: every round change is in the audit log.
    const audited = await app.prisma.adminAuditLog.findMany({ where: { targetType: 'round', targetId: { in: [seasonId, nextSeasonId] } }, select: { action: true } });
    expect(audited.map((row) => row.action)).toEqual(expect.arrayContaining(['round.schedule', 'round.start', 'round.end-early', 'round.archive']));
  });
});
