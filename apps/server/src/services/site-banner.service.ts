import type { PrismaClient, SiteBanner } from '@prisma/client';
import type { AdminSiteBannersDto, SiteBannerDto, SiteBannerTone } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';

const TONES: SiteBannerTone[] = ['info', 'warning', 'critical'];
const MAX_BANNER_DAYS = 30;

export function toSiteBannerDto(row: SiteBanner): SiteBannerDto {
  return {
    id: row.id,
    message: row.message,
    tone: TONES.includes(row.tone as SiteBannerTone) ? row.tone as SiteBannerTone : 'info',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    createdByUsername: row.createdByUsername,
  };
}

export const SiteBannerService = {
  /** The newest banner that is live right now, if any. */
  async current(prisma: PrismaClient, now = new Date()): Promise<SiteBannerDto | null> {
    const row = await prisma.siteBanner.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    });
    return row ? toSiteBannerDto(row) : null;
  },

  async adminList(prisma: PrismaClient, now = new Date()): Promise<AdminSiteBannersDto> {
    const [current, rows] = await Promise.all([
      SiteBannerService.current(prisma, now),
      prisma.siteBanner.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 }),
    ]);
    return { current, banners: rows.map(toSiteBannerDto) };
  },

  async create(
    prisma: PrismaClient,
    actor: AuditActor,
    input: { message: string; tone: SiteBannerTone; startsAt?: Date | undefined; endsAt: Date },
    now = new Date(),
  ): Promise<AdminSiteBannersDto> {
    const startsAt = input.startsAt ?? now;
    if (input.endsAt.getTime() <= startsAt.getTime() || input.endsAt.getTime() <= now.getTime()) {
      throw AppError.badRequest('INVALID_BANNER_WINDOW', 'The banner has to end in the future, after it starts.', { endsAt: 'Must be after the start and in the future.' });
    }
    if (input.endsAt.getTime() - startsAt.getTime() > MAX_BANNER_DAYS * 86_400_000) {
      throw AppError.badRequest('INVALID_BANNER_WINDOW', `Banners can run for at most ${MAX_BANNER_DAYS} days.`, { endsAt: `At most ${MAX_BANNER_DAYS} days after the start.` });
    }
    await prisma.$transaction(async (tx) => {
      const banner = await tx.siteBanner.create({
        data: {
          message: input.message,
          tone: input.tone,
          startsAt,
          endsAt: input.endsAt,
          createdByAccountId: actor.id,
          createdByUsername: actor.username,
        },
      });
      await AdminAuditService.record(tx, actor, { action: 'banner.create', targetType: 'banner', targetId: banner.id, after: banner });
    });
    return SiteBannerService.adminList(prisma, now);
  },

  async end(prisma: PrismaClient, actor: AuditActor, bannerId: string, now = new Date()): Promise<AdminSiteBannersDto> {
    await prisma.$transaction(async (tx) => {
      const before = await tx.siteBanner.findUnique({ where: { id: bannerId } });
      if (!before) throw AppError.notFound('BANNER_NOT_FOUND', 'That banner does not exist.');
      if (before.endsAt.getTime() <= now.getTime()) throw AppError.conflict('BANNER_ALREADY_ENDED', 'That banner has already ended.');
      const ended = await tx.siteBanner.update({
        where: { id: before.id },
        data: { endsAt: now, ...(before.startsAt.getTime() > now.getTime() ? { startsAt: now } : {}) },
      });
      await AdminAuditService.record(tx, actor, { action: 'banner.end', targetType: 'banner', targetId: before.id, before, after: ended });
    });
    return SiteBannerService.adminList(prisma, now);
  },
};
