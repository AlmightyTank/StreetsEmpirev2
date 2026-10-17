import type { OperationDto } from '@streets/shared';
import type { UnderworldOperationTemplate } from '@streets/rulesets';
import type { Db } from '../utils/db.js';

export const OPERATION_ROLES = ['driver', 'enforcer', 'intel'] as const;
export type OperationRole = (typeof OPERATION_ROLES)[number];

export const LEADER_COOLDOWN_HOURS = 24;
export const TEMPLATE_PAYOUT_CENTS = 150_000;

export const ROUND_CLOCK_SELECT = {
  id: true,
  rulesetId: true,
  rulesetVersion: true,
  pausedAt: true,
  pausedMinutesTotal: true,
  underworldOperationsEnabled: true,
} as const;

export type RoundClock = {
  id: string;
  rulesetId: string;
  rulesetVersion: string;
  pausedAt: Date | null;
  pausedMinutesTotal: number;
  underworldOperationsEnabled: boolean;
};

export function pauseOffsetMs(round: { pausedAt: Date | null; pausedMinutesTotal: number } | null, now: Date): number {
  if (!round) return 0;
  const completed = Math.max(0, round.pausedMinutesTotal) * 60_000;
  const open = round.pausedAt ? Math.max(0, now.getTime() - round.pausedAt.getTime()) : 0;
  return completed + open;
}

/** Wall-clock expiry plus pause time still counts as open. */
export function inviteOpen(expiresAt: Date | null, now: Date, pauseMs: number): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() + pauseMs > now.getTime();
}

export function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

type Seat = { role: string; roundPlayerId: string; status: string; expiresAt: Date | null };

export async function recordOperationTransition(
  tx: Db | { operationTransition: Db['operationTransition'] },
  operationId: string,
  actorId: string | null,
  fromStatus: string,
  toStatus: string,
  reason: string,
): Promise<void> {
  await tx.operationTransition.create({
    data: { operationId, actorId, fromStatus, toStatus, reason },
  });
}

export function snapshotOf(value: unknown): UnderworldOperationTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as UnderworldOperationTemplate;
  if (!row.key || !row.bands || !row.roles) return null;
  return row;
}

export function toOperationDto(
  operation: {
    id: string;
    template: string;
    status: string;
    target: unknown;
    report: unknown;
    createdAt: Date;
    leaderId: string;
    catalogKey?: string | null;
    catalogVersion?: string | null;
    rulesSnapshot?: unknown;
    windows?: unknown;
    city: { slug: string; name: string };
  },
  seats: Array<Seat & { roundPlayer: { id: string; displayName: string } }>,
  viewerId: string,
  now: Date,
  pauseMs = 0,
): OperationDto {
  const target = (operation.target ?? {}) as { district?: string };
  const snapshot = snapshotOf(operation.rulesSnapshot);
  const roleKeys = snapshot ? snapshot.roles.map((role) => role.key) : [...OPERATION_ROLES];
  const byRole = new Map(seats.map((seat) => [seat.role, seat]));
  const seatOpenNow = (seat: Seat | undefined) => !seat || seat.status === 'DECLINED'
    || (seat.status === 'INVITED' && !inviteOpen(seat.expiresAt, now, pauseMs));
  const seatDtos = roleKeys.map((role) => {
    const seat = byRole.get(role);
    const open = seatOpenNow(seat);
    return {
      role,
      roundPlayerId: open ? null : seat!.roundPlayerId,
      displayName: open ? null : seat!.roundPlayer.displayName,
      status: open ? 'OPEN' as const : seat!.status as OperationDto['seats'][number]['status'],
    };
  });
  const classic = Object.fromEntries(OPERATION_ROLES.map((role) => {
    const seat = seatDtos.find((entry) => entry.role === role);
    return [role, seat ?? { roundPlayerId: null, displayName: null, status: 'OPEN' as const }];
  })) as OperationDto['roles'];
  const mine = seats.find((seat) => seat.roundPlayerId === viewerId && seat.status === 'INVITED'
    && inviteOpen(seat.expiresAt, now, pauseMs));
  const report = operation.report as OperationDto['report'];
  const windows = Array.isArray(operation.windows) ? operation.windows as Array<{ key?: string; sourceId?: string | null }> : [];
  const checklist = snapshot
    ? [
      ...snapshot.windows.map((window) => ({
        key: window.key,
        label: window.key,
        done: windows.some((row) => row.key === window.key && Boolean(row.sourceId)),
        sourceKinds: [...window.sourceKinds],
      })),
      ...seatDtos.map((seat) => ({ key: `seat:${seat.role}`, label: seat.role, done: seat.status === 'LOCKED' || seat.status === 'ACCEPTED' })),
    ]
    : seatDtos.map((seat) => ({
      key: seat.role,
      label: seat.role,
      done: seat.status === 'LOCKED' || seat.status === 'ACCEPTED',
    }));
  const deadlineHours = snapshot?.deadlineHours ?? null;
  const countdownEnds = deadlineHours
    ? new Date(operation.createdAt.getTime() + deadlineHours * 3_600_000 + pauseMs).toISOString()
    : mine?.expiresAt ? new Date(mine.expiresAt.getTime() + pauseMs).toISOString() : null;
  return {
    id: operation.id,
    template: operation.template,
    label: snapshot?.label ?? 'Corner takeover',
    catalogKey: operation.catalogKey ?? null,
    catalogVersion: operation.catalogVersion ?? null,
    status: operation.status as OperationDto['status'],
    citySlug: operation.city.slug,
    cityName: operation.city.name,
    district: (target.district ?? null) as OperationDto['district'],
    roles: classic,
    seats: seatDtos,
    checklist,
    canCite: operation.leaderId === viewerId || seats.some((seat) => seat.roundPlayerId === viewerId && (seat.status === 'LOCKED' || seat.status === 'ACCEPTED')),
    countdownEndsAt: countdownEnds,
    bands: snapshot ? {
      success: snapshot.bands.success,
      partial: snapshot.bands.partial,
      failure: snapshot.bands.failure,
    } : null,
    isLeader: operation.leaderId === viewerId,
    myInvite: mine ? { role: mine.role, expiresAt: mine.expiresAt ? new Date(mine.expiresAt.getTime() + pauseMs).toISOString() : null } : null,
    report,
    createdAt: operation.createdAt.toISOString(),
  };
}

export const operationInclude = {
  city: { select: { slug: true, name: true } },
  participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
};
