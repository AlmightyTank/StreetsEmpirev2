import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { APP_VERSION } from '@streets/shared';
import { DatabaseEnvironmentMismatch, PlatformService } from '../platform.service.js';

/** 1.0.0-A. Version visibility and the database claim against PostgreSQL. */
describe.runIf(process.env.PLATFORM_INTEGRATION === '1')('1.0.0-A launch infrastructure with PostgreSQL', () => {
  let app: FastifyInstance;
  let original: { environment: string; lastBootVersion: string; claimedAt: Date; lastBootAt: Date } | null = null;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    original = await app.prisma.deploymentIdentity.findUnique({ where: { id: 'singleton' } });
  });

  afterAll(async () => {
    // Leave a developer's database exactly as it was: claimed or not.
    await app.prisma.deploymentIdentity.deleteMany({});
    if (original) await app.prisma.deploymentIdentity.create({ data: { id: 'singleton', ...original } });
    await app?.close();
  });

  it('reports the build, environment, ruleset and season on every host', async () => {
    const meta = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(meta.statusCode).toBe(200);
    expect(meta.headers['cache-control']).toBe('no-store');
    expect(meta.json()).toMatchObject({
      environment: 'test',
      app: { version: APP_VERSION },
      ruleset: { id: expect.any(String), version: expect.any(String) },
    });

    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ ok: true, version: APP_VERSION, environment: 'test' });
    expect((await app.inject({ method: 'GET', url: '/api/ready' })).json()).toMatchObject({ ok: true, environment: 'test', version: APP_VERSION });
    const status = await app.inject({ method: 'GET', url: '/api/public/status' });
    expect(status.json().platform).toMatchObject({ environment: 'test', app: { version: APP_VERSION } });
  });

  it('claims the database once and refuses another environment', async () => {
    await app.prisma.deploymentIdentity.deleteMany({});
    await expect(PlatformService.bindDatabase(app.prisma, 'beta')).resolves.toEqual({ environment: 'beta', claimed: true });
    await expect(PlatformService.bindDatabase(app.prisma, 'beta')).resolves.toEqual({ environment: 'beta', claimed: false });
    await expect(PlatformService.bindDatabase(app.prisma, 'production')).rejects.toBeInstanceOf(DatabaseEnvironmentMismatch);
    const row = await app.prisma.deploymentIdentity.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(row).toMatchObject({ environment: 'beta', lastBootVersion: APP_VERSION });

    // Two servers booting against a fresh database at once: exactly one environment wins.
    await app.prisma.deploymentIdentity.deleteMany({});
    const results = await Promise.allSettled([
      PlatformService.bindDatabase(app.prisma, 'production'),
      PlatformService.bindDatabase(app.prisma, 'beta'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
