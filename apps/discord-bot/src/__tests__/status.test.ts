import { describe, expect, it } from 'vitest';
import { deployMessage, maintenanceMessage, OutageWatch, outageMessage, recoveredMessage, statusEmbed, statusPostMessage } from '../status.js';

const MIN = 60_000;
const t0 = Date.parse('2026-10-10T15:00:00.000Z');

describe('OutageWatch', () => {
  it('posts once after the threshold and once on recovery', () => {
    const watch = new OutageWatch(3 * MIN);
    expect(watch.record(true, t0)).toBeNull();
    expect(watch.record(false, t0 + MIN)).toBeNull();
    expect(watch.record(false, t0 + 2 * MIN)).toBeNull();
    expect(watch.record(false, t0 + 4 * MIN)).toEqual({ event: 'down', since: t0 + MIN });
    expect(watch.record(false, t0 + 5 * MIN)).toBeNull();
    expect(watch.record(true, t0 + 9 * MIN)).toEqual({ event: 'up', since: t0 + MIN, downForMs: 8 * MIN });
    expect(watch.record(true, t0 + 10 * MIN)).toBeNull();
  });

  it('says nothing about a blip shorter than the threshold', () => {
    const watch = new OutageWatch(3 * MIN);
    expect(watch.record(false, t0)).toBeNull();
    expect(watch.record(false, t0 + 2 * MIN)).toBeNull();
    expect(watch.record(true, t0 + 2.5 * MIN)).toBeNull();
    // A fresh failure starts a fresh count.
    expect(watch.record(false, t0 + 3 * MIN)).toBeNull();
  });

  it('stays quiet through a deploy it knows about, unless the game stays down past the grace', () => {
    const watch = new OutageWatch(3 * MIN, 20 * MIN);
    watch.deployStarted(t0);
    expect(watch.record(false, t0 + MIN)).toBeNull();
    expect(watch.record(false, t0 + 10 * MIN)).toBeNull();
    expect(watch.record(false, t0 + 21 * MIN)).toEqual({ event: 'down', since: t0 + MIN });

    const finished = new OutageWatch(3 * MIN, 20 * MIN);
    finished.deployStarted(t0);
    finished.deployEnded();
    finished.record(false, t0 + MIN);
    expect(finished.record(false, t0 + 5 * MIN)).toEqual({ event: 'down', since: t0 + MIN });
  });
});

describe('status messages', () => {
  it('turns a deploy into one post that says it is updating, then finished or failed', () => {
    const at = '2026-10-10T15:00:00.000Z';
    const started = deployMessage({ phase: 'started', commit: 'abcdef1234567890', at });
    expect(started.embeds[0]).toMatchObject({ title: '🛠 Updating StreetsEmpire', footer: { text: 'Build abcdef1' } });
    expect(deployMessage({ phase: 'finished', commit: 'abcdef1234567890', at }).embeds[0]!.title).toBe('✅ Update finished');
    expect(deployMessage({ phase: 'failed', commit: 'abcdef1234567890', at }).embeds[0]!.title).toBe('⚠️ Update hit a problem');
  });

  it('shows the maintenance window in each reader\'s own time, with the message escaped', () => {
    const [embed] = maintenanceMessage({ message: 'Database *upgrade*', startsAt: '2026-10-12T02:00:00.000Z', endsAt: '2026-10-12T03:00:00.000Z' }).embeds;
    expect(embed!.description).toBe('Database \\*upgrade\\*');
    const starts = Date.parse('2026-10-12T02:00:00.000Z') / 1000;
    expect(embed!.fields![0]!.value).toBe(`<t:${starts}:F> (<t:${starts}:R>)`);
  });

  it('describes an outage and its recovery', () => {
    expect(outageMessage(t0, t0 + 4 * MIN).embeds[0]!.description).toContain('about 4 min');
    expect(recoveredMessage(t0, 8 * MIN).embeds[0]).toMatchObject({ title: '🟢 StreetsEmpire is back', timestamp: new Date(t0 + 8 * MIN).toISOString() });
  });

  it('only turns status posts into status messages', () => {
    expect(statusPostMessage({ id: 'p', kind: 'STATUS_DEPLOY_STARTED', editMessageId: null, deploy: { phase: 'started', commit: 'abc1234', at: '2026-10-10T15:00:00.000Z' } })).not.toBeNull();
    expect(statusPostMessage({ id: 'p', kind: 'PATCH_NOTES_HELD', editMessageId: null })).toBeNull();
  });
});

describe('statusEmbed', () => {
  const meta = { app: { version: '1.6.5', commit: 'abcdef1234567890' }, season: { name: 'Game #021', status: 'ACTIVE', endsAt: '2026-10-20T00:00:00.000Z' } };

  it('shows the version, season and maintenance when the game is up', () => {
    const embed = statusEmbed({
      up: true,
      meta,
      banner: { message: 'Upgrade', kind: 'maintenance', maintenance: { startsAt: '2026-10-12T02:00:00.000Z', endsAt: '2026-10-12T03:00:00.000Z' } },
      origin: 'https://streetsempire.dev',
    });
    expect(embed.title).toBe('🟢 StreetsEmpire is up');
    expect(embed.fields!.map((field) => field.value)).toEqual([
      'v1.6.5 (abcdef1)',
      `Game \\#021, running, ends <t:${Date.parse('2026-10-20T00:00:00.000Z') / 1000}:R>`,
      `<t:${Date.parse('2026-10-12T02:00:00.000Z') / 1000}:F> to about <t:${Date.parse('2026-10-12T03:00:00.000Z') / 1000}:t>`,
    ]);
  });

  it('still answers when the game is down', () => {
    const embed = statusEmbed({ up: false, meta: null, banner: null, origin: 'https://streetsempire.dev' });
    expect(embed.title).toBe("🔴 StreetsEmpire isn't answering");
    expect(embed.fields).toEqual([{ name: 'Maintenance', value: 'None scheduled' }]);
  });
});
