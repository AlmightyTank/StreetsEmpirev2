import { describe, expect, it } from 'vitest';
import {
  STAFF_CAPABILITIES,
  assignableStaffRoles,
  staffCan,
  staffCapabilities,
  staffMayChangeRole,
  staffMayMuteFor,
  staffOutranks,
} from '../staff.js';

describe('staff roles', () => {
  it('gives every capability to Founder and Admin, and none to players', () => {
    expect(staffCapabilities('FOUNDER')).toEqual(STAFF_CAPABILITIES);
    expect(staffCapabilities('ADMIN')).toEqual(STAFF_CAPABILITIES);
    expect(staffCapabilities(null)).toEqual([]);
  });

  it('keeps private account data and the admin tools to Admin and up', () => {
    for (const role of ['MOD', 'JR_MOD', 'HELPER'] as const) {
      expect(staffCan(role, 'admin')).toBe(false);
      expect(staffCan(role, 'accounts.private')).toBe(false);
      expect(staffCan(role, 'staff.assign')).toBe(false);
    }
  });

  it('lets Mods ban and rename, JR Mods mute and take notes, Helpers only triage and look up', () => {
    expect(staffCapabilities('MOD')).toEqual(expect.arrayContaining(['accounts.ban', 'accounts.suspend', 'accounts.rename', 'accounts.mute', 'reports.handle']));
    expect(staffCan('JR_MOD', 'accounts.ban')).toBe(false);
    expect(staffCan('JR_MOD', 'accounts.rename')).toBe(false);
    expect(staffCapabilities('JR_MOD')).toEqual(expect.arrayContaining(['accounts.mute', 'accounts.notes', 'reports.handle']));
    expect(staffCapabilities('HELPER')).toEqual(['staff.view', 'accounts.view', 'bugs.triage', 'support.tickets']);
  });

  it('caps JR Mod mutes at a day and never lets them mute for good', () => {
    expect(staffMayMuteFor('JR_MOD', 1)).toBe(true);
    expect(staffMayMuteFor('JR_MOD', 24)).toBe(true);
    expect(staffMayMuteFor('JR_MOD', 72)).toBe(false);
    expect(staffMayMuteFor('JR_MOD', null)).toBe(false);
    expect(staffMayMuteFor('MOD', null)).toBe(true);
    expect(staffMayMuteFor('HELPER', 1)).toBe(false);
  });

  it('only acts downward: nobody outranks their own rank or above', () => {
    expect(staffOutranks('MOD', null)).toBe(true);
    expect(staffOutranks('MOD', 'JR_MOD')).toBe(true);
    expect(staffOutranks('MOD', 'MOD')).toBe(false);
    expect(staffOutranks('ADMIN', 'ADMIN')).toBe(false);
    expect(staffOutranks('ADMIN', 'FOUNDER')).toBe(false);
    expect(staffOutranks('FOUNDER', 'ADMIN')).toBe(true);
  });

  it('never offers Founder, and only the Founder makes Admins', () => {
    expect(assignableStaffRoles('FOUNDER')).toEqual(['ADMIN', 'MOD', 'JR_MOD', 'HELPER']);
    expect(assignableStaffRoles('ADMIN')).toEqual(['MOD', 'JR_MOD', 'HELPER']);
    expect(assignableStaffRoles('MOD')).toEqual([]);
    expect(staffMayChangeRole('ADMIN', null, 'MOD')).toBe(true);
    expect(staffMayChangeRole('ADMIN', 'MOD', null)).toBe(true);
    expect(staffMayChangeRole('ADMIN', null, 'ADMIN')).toBe(false);
    expect(staffMayChangeRole('ADMIN', 'ADMIN', null)).toBe(false);
    expect(staffMayChangeRole('FOUNDER', 'ADMIN', null)).toBe(true);
    expect(staffMayChangeRole('FOUNDER', null, 'FOUNDER')).toBe(false);
    expect(staffMayChangeRole('MOD', null, 'HELPER')).toBe(false);
  });
});
