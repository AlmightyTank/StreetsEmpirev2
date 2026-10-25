import type { Prisma, PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { createPlayerActivity } from './in-app-notification.service.js';

/**
 * Hideout construction. An upgrade pays its cash, turns and components up front
 * and then takes real time; the room's level only lands once the build is ready.
 * One room is under construction at a time.
 */

export type HideoutBuildRoom = 'SAFE_ROOM' | 'LOOKOUTS' | 'WORKSHOP' | 'BACK_OFFICE' | 'GARAGE' | 'STORAGE';

const LEVEL_FIELDS: Record<HideoutBuildRoom, 'hideoutSafeRoomLevel' | 'hideoutLookoutsLevel' | 'hideoutWorkshopLevel' | 'hideoutBackOfficeLevel' | 'hideoutGarageLevel' | 'hideoutStorageLevel'> = {
  SAFE_ROOM: 'hideoutSafeRoomLevel',
  LOOKOUTS: 'hideoutLookoutsLevel',
  WORKSHOP: 'hideoutWorkshopLevel',
  BACK_OFFICE: 'hideoutBackOfficeLevel',
  GARAGE: 'hideoutGarageLevel',
  STORAGE: 'hideoutStorageLevel',
};

export const HIDEOUT_ROOM_NAMES: Record<HideoutBuildRoom, string> = {
  SAFE_ROOM: 'Safe Room',
  LOOKOUTS: 'Lookouts',
  WORKSHOP: 'Workshop',
  BACK_OFFICE: 'Back Office',
  GARAGE: 'Garage',
  STORAGE: 'Storage',
};

// Minutes of construction by target level. Room level 1 stays instant so the
// first upgrade lesson lands straight away; every level after that takes longer.
const ROOM_BUILD_MINUTES = [0, 30, 120, 360, 720];
const STORAGE_BUILD_MINUTES = [15, 60, 240];
const LONGEST_BUILD_MINUTES = 24 * 60;

export function hideoutBuildMinutes(room: string, level: number): number {
  const table = room === 'STORAGE' ? STORAGE_BUILD_MINUTES : ROOM_BUILD_MINUTES;
  return table[level - 1] ?? LONGEST_BUILD_MINUTES;
}

export function isHideoutBuildRoom(value: unknown): value is HideoutBuildRoom {
  return typeof value === 'string' && Object.hasOwn(LEVEL_FIELDS, value);
}

const BATCH = 200;

export const HideoutBuildService = {
  /** Lands a build that is due. Safe to call on every settle; a no-op otherwise. */
  async settle(db: Db, roundPlayerId: string, now: Date): Promise<boolean> {
    const player = await db.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: {
        hideoutBuildRoom: true, hideoutBuildLevel: true, hideoutBuildReadyAt: true,
        hideoutSafeRoomLevel: true, hideoutLookoutsLevel: true, hideoutWorkshopLevel: true,
        hideoutBackOfficeLevel: true, hideoutGarageLevel: true, hideoutStorageLevel: true,
      },
    });
    if (!player?.hideoutBuildReadyAt || player.hideoutBuildReadyAt > now) return false;
    const room = player.hideoutBuildRoom;
    const level = player.hideoutBuildLevel ?? 0;
    const clear = { hideoutBuildRoom: null, hideoutBuildLevel: null, hideoutBuildStartedAt: null, hideoutBuildReadyAt: null };
    // Claim the build with a conditional write so a sweep and a page load never land it twice.
    const claimed = await db.roundPlayer.updateMany({
      where: { id: roundPlayerId, hideoutBuildReadyAt: player.hideoutBuildReadyAt },
      data: clear,
    });
    if (!claimed.count || !isHideoutBuildRoom(room)) return false;
    const field = LEVEL_FIELDS[room];
    if (player[field] < level) {
      await db.roundPlayer.update({ where: { id: roundPlayerId }, data: { [field]: level } as Prisma.RoundPlayerUpdateInput });
    }
    await createPlayerActivity(db, roundPlayerId, 'HIDEOUT_BUILD_COMPLETE', { room, name: HIDEOUT_ROOM_NAMES[room], level });
    return true;
  },

  /** Players whose build is due, so the poller can land it while they are away. */
  async dueOwners(prisma: PrismaClient, now: Date): Promise<string[]> {
    const rows = await prisma.roundPlayer.findMany({
      where: { hideoutBuildReadyAt: { lte: now }, round: { status: 'ACTIVE' } },
      select: { id: true },
      take: BATCH,
    });
    return rows.map((row) => row.id);
  },
};
