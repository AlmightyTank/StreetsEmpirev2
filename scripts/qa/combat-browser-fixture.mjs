// Disposable local browser QA. Uses dedicated accounts, an old fixture round,
// a separate cookie, and separate ports. Never changes the real current round.
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { classicOgV02D } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';

process.env.SESSION_COOKIE_NAME = 'se_combat_qa';
process.env.CORS_ORIGINS = 'http://localhost:5274,http://127.0.0.1:5274';
const { buildApp } = await import('../../apps/server/src/app.ts');
const { RoundService } = await import('../../apps/server/src/services/round.service.ts');
const { NetWorthService } = await import('../../apps/server/src/services/net-worth.service.ts');
const app = await buildApp();
const accounts = [];
let round;
let web;
let dropNextReply = false;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await web?.close();
  if (round) await app.prisma.round.delete({ where: { id: round.id } });
  if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
  await app.close();
  console.log('Browser QA stopped; fixture round and accounts removed.');
  process.exit(0);
}
try {
  const rules = classicOgV02D;
  const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
  round = await app.prisma.round.create({ data: { name: 'Combat Browser QA', slug: `combat-browser-${randomUUID()}`,
    rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000) } });
  RoundService.getCurrent = async () => round;
  RoundService.requireCurrent = async () => round;
  // Installed before app.inject readies the app.
  app.addHook('onSend', async (request, reply, payload) => {
    if (dropNextReply && request.url === '/api/game/combat/raid' && reply.statusCode === 200) {
      dropNextReply = false;
      reply.raw.destroy();
      return reply;
    }
    return payload;
  });
  const password = `QA-${randomUUID()}`;
  const suffix = randomUUID().slice(0, 6);
  for (let i = 0; i < 2; i++) {
    const username = `${i === 0 ? 'raider' : 'defender'}_${suffix}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password } });
    if (response.statusCode !== 201) throw new Error(response.body);
    accounts.push(response.json().account.id);
    const data = { ...rules.round.startingPlayer, ...startingStock(rules),
      thugs: i === 0 ? 100 : 50, woundedThugs: 0, pistols: i === 0 ? 100 : 50, beer: 100, medicine: i === 0 ? 10 : 0,
      cashCents: i === 0 ? 2_000_000n : 4_100_000n };
    await app.prisma.roundPlayer.create({ data: { ...data, roundId: round.id, accountId: accounts[i], cityId: city.id,
      publicPimpId: 1000 + i, displayName: username, createdAt: new Date(Date.now() - 2 * 86_400_000),
      netWorthCents: NetWorthService.calculate(data, rules) } });
    console.log(`QA login: ${username}`);
  }
  console.log(`QA-only password: ${password}`);
  await app.listen({ host: '127.0.0.1', port: 3301 });
  web = await createServer({ configFile: 'apps/web/vite.config.ts', root: 'apps/web', server: { host: '127.0.0.1', port: 5274, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3301', changeOrigin: false } } } });
  await web.listen();
  console.log('Browser QA: http://127.0.0.1:5274/login. This uses 0.2.0-D strategy raids; recon costs 2 turns and the raider has medicine. Enter d to drop the next successful raid reply; q to clean up.');
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (text) => {
    if (text.trim() === 'q') void close();
    if (text.trim() === 'd') { dropNextReply = true; console.log('The next successful raid reply will be dropped after commit.'); }
  });
  process.on('SIGINT', () => void close());
  process.on('SIGTERM', () => void close());
} catch (error) {
  console.error(error);
  await close();
}
