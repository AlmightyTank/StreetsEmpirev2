import type { PrismaClient, StaffRole } from '@prisma/client';
import { STAFF_ROLES, assignableStaffRoles, type AdminStaffDto, type AdminStaffRoleChangeDto } from '@streets/shared';

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
};
