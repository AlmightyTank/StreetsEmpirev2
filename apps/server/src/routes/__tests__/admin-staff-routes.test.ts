import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAFF_ROUTES, staffCapabilityFor } from '../admin.routes.js';

const source = readFileSync(new URL('../admin.routes.ts', import.meta.url), 'utf8');
const declared = new Set([...source.matchAll(/fastify\.(get|post|patch|put|delete)\('([^']+)'/g)].map(([, method, path]) => `${method!.toUpperCase()} ${path}`));

describe('admin route staff capabilities', () => {
  it('names only routes the plugin declares', () => {
    expect(STAFF_ROUTES.filter((route) => !declared.has(route))).toEqual([]);
  });

  it('keeps every other route admin-only', () => {
    expect(staffCapabilityFor('POST', '/rounds')).toBe('admin');
    expect(staffCapabilityFor('POST', '/accounts/:accountId/delete')).toBe('admin');
    expect(staffCapabilityFor('POST', '/accounts/:accountId/admin')).toBe('admin');
    expect(staffCapabilityFor('GET', '/audit')).toBe('admin');
    expect(staffCapabilityFor('HEAD', '/accounts')).toBe('admin');
    expect(staffCapabilityFor('GET', '/not-a-route')).toBe('admin');
  });

  it('opens moderation routes to the roles that moderate', () => {
    expect(staffCapabilityFor('POST', '/accounts/:accountId/ban')).toBe('accounts.ban');
    expect(staffCapabilityFor('POST', '/accounts/:accountId/comms-mute')).toBe('accounts.mute');
    expect(staffCapabilityFor('GET', '/bug-reports')).toBe('bugs.triage');
    expect(staffCapabilityFor('POST', '/accounts/:accountId/staff-role')).toBe('staff.assign');
  });
});
