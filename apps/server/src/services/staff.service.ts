import type { PrismaClient, StaffRole } from '@prisma/client';
import { STAFF_ROLES, assignableStaffRoles, type AdminStaffDto, type AdminStaffRoleChangeDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { AdminAccountService } from './admin-account.service.js';
import { linkedDiscordAccount } from './discord-staff.service.js';
import { actorStaffRole } from './staff-guard.js';

const HISTORY_LIMIT = 50;

function source(value: string): AdminStaffRoleChangeDto['source'] {
  return value === 'DISCORD' || value === 'CONSOLE' ? value : 'GAME';
}

export const StaffService = {
  /** Admin → Staff: everyone with a role, highest first, and the latest role changes. */
  async list(prisma: PrismaClient, viewerRole: StaffRole): Promise<AdminStaffDto> {
    const [members, history] = await Promise.all([
      prisma.account.findMany({
        where: { staffRole: { not: null } },
        select: {
          id: true,
          username: true,
          staffRole: true,
          discordUsername: true,
          twoFactorEnabledAt: true,
          isActive: true,
          lastLoginAt: true,
          forumLink: { select: { forumUsername: true } },
          staffRoleChanges: { orderBy: { createdAt: 'desc' }, take: 1, select: { toRole: true, createdAt: true } },
        },
      }),
      prisma.staffRoleChange.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: HISTORY_LIMIT }),
    ]);

    const order = (role: StaffRole) => STAFF_ROLES.indexOf(role);
    return {
      members: members
        .map((member) => {
          const latest = member.staffRoleChanges[0];
          return {
            accountId: member.id,
            username: member.username,
            staffRole: member.staffRole!,
            discordUsername: member.discordUsername,
            forumUsername: member.forumLink?.forumUsername ?? null,
            twoFactorEnabled: Boolean(member.twoFactorEnabledAt),
            isActive: member.isActive,
            lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
            since: latest && latest.toRole === member.staffRole ? latest.createdAt.toISOString() : null,
          };
        })
        .sort((a, b) => order(a.staffRole) - order(b.staffRole) || a.username.localeCompare(b.username)),
      history: history.map((change) => ({
        id: change.id,
        accountId: change.accountId,
        username: change.username,
        actorUsername: change.actorUsername,
        fromRole: change.fromRole,
        toRole: change.toRole,
        reason: change.reason,
        source: source(change.source),
        createdAt: change.createdAt.toISOString(),
      })),
      assignable: assignableStaffRoles(viewerRole),
    };
  },

  /**
   * /staff set and /staff remove. The caller is their linked game account, and the change
   * goes through setStaffRole like the panel's, so the rank rules and audit trail are one.
   */
  async setFromDiscord(
    prisma: PrismaClient,
    input: { discordId: string; targetDiscordId: string; role: StaffRole | null; reason: string },
  ): Promise<{ username: string; fromRole: StaffRole | null; toRole: StaffRole | null }> {
    const actor = await linkedDiscordAccount(prisma, input.discordId);
    const target = await prisma.account.findFirst({ where: { discordId: input.targetDiscordId }, select: { id: true, username: true, staffRole: true } });
    if (!target) throw AppError.notFound('DISCORD_TARGET_NOT_LINKED', 'That member has not linked a StreetsEmpire account, so they cannot hold a staff role.');
    const detail = await AdminAccountService.setStaffRole(prisma, actor, target.id, input.role, input.reason, 'DISCORD');
    return { username: detail.account.username, fromRole: target.staffRole, toRole: detail.account.staffRole };
  },

  /** /staff list: everyone with a role, with what Discord sync needs from them. Helpers and up. */
  async listForDiscord(prisma: PrismaClient, discordId: string): Promise<{ members: Array<{ username: string; staffRole: StaffRole; discordId: string | null; forumLinked: boolean; isActive: boolean }> }> {
    await actorStaffRole(prisma, await linkedDiscordAccount(prisma, discordId), 'staff.view');
    const members = await prisma.account.findMany({
      where: { staffRole: { not: null } },
      select: { username: true, staffRole: true, discordId: true, isActive: true, forumLink: { select: { accountId: true } } },
    });
    const order = (role: StaffRole) => STAFF_ROLES.indexOf(role);
    return {
      members: members
        .map((member) => ({ username: member.username, staffRole: member.staffRole!, discordId: member.discordId, forumLinked: Boolean(member.forumLink), isActive: member.isActive }))
        .sort((a, b) => order(a.staffRole) - order(b.staffRole) || a.username.localeCompare(b.username)),
    };
  },
};
