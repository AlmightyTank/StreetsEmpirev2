import type { PrismaClient } from '@prisma/client';
import { readStreetSignDesign, type HideoutCosmeticsDto, type UpdateHideoutCosmeticsInput } from '@streets/shared';
import { AppError } from '../utils/errors.js';

type CosmeticSlot = 'decoration' | 'streetSign';

function options(rows: Array<{ key: string; styleKey: string | null; title: string; description: string }>) {
  return rows.map((row) => ({ key: row.styleKey ?? row.key, label: row.title, description: row.description }));
}

const SEASONAL_DECORATIONS = [
  { key: 'halloween-moon', label: 'Halloween Moon', description: 'A cold moon, carved shadows, and a headquarters built for the spooky season.' },
  { key: 'winter-lights', label: 'Winter Lights', description: 'Christmas lights and a warm winter glow across the headquarters.' },
];

/** Account-level Hideout presentation. It never reads or writes seasonal gameplay state. */
export const HideoutCosmeticService = {
  async catalog(prisma: PrismaClient, accountId: string): Promise<HideoutCosmeticsDto> {
    const [profile, rows] = await Promise.all([
      prisma.accountProfile.findUnique({ where: { accountId }, select: { activeHideoutDecorationKey: true, activeStreetSignKey: true, streetSign: true } }),
      prisma.accountCosmeticUnlock.findMany({
        where: { accountId, kind: { in: ['HIDEOUT_DECOR', 'STREET_SIGN'] } },
        orderBy: [{ awardedAt: 'asc' }, { key: 'asc' }],
      }),
    ]);
    const decorations = [...SEASONAL_DECORATIONS, ...options(rows.filter((row) => row.kind === 'HIDEOUT_DECOR'))]
      .filter((option, index, all) => all.findIndex((candidate) => candidate.key === option.key) === index);
    const streetSigns = options(rows.filter((row) => row.kind === 'STREET_SIGN'));
    const decorationKeys = new Set(decorations.map((row) => row.key));
    const streetSignKeys = new Set(streetSigns.map((row) => row.key));
    return {
      activeDecorationKey: profile?.activeHideoutDecorationKey && decorationKeys.has(profile.activeHideoutDecorationKey) ? profile.activeHideoutDecorationKey : null,
      activeStreetSignKey: profile?.activeStreetSignKey && streetSignKeys.has(profile.activeStreetSignKey) ? profile.activeStreetSignKey : null,
      decorations,
      streetSigns,
      streetSign: readStreetSignDesign(profile?.streetSign),
    };
  },

  async update(prisma: PrismaClient, accountId: string, input: UpdateHideoutCosmeticsInput): Promise<HideoutCosmeticsDto> {
    const rows = await prisma.accountCosmeticUnlock.findMany({
      where: { accountId, kind: { in: ['HIDEOUT_DECOR', 'STREET_SIGN'] } },
      select: { key: true, styleKey: true, title: true, description: true, kind: true },
    });
    const keysFor = (slot: CosmeticSlot) => new Set(rows
      .filter((row) => row.kind === (slot === 'decoration' ? 'HIDEOUT_DECOR' : 'STREET_SIGN'))
      .map((row) => row.styleKey ?? row.key));
    const decorationKeys = new Set([...keysFor('decoration'), ...SEASONAL_DECORATIONS.map((option) => option.key)]);
    if (input.decorationKey && !decorationKeys.has(input.decorationKey)) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick a hideout decoration you have already earned.', { decorationKey: 'That decoration is not unlocked.' });
    }
    if (input.streetSignKey && !keysFor('streetSign').has(input.streetSignKey)) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick a street sign you have already earned.', { streetSignKey: 'That street sign is not unlocked.' });
    }
    await prisma.accountProfile.upsert({
      where: { accountId },
      create: { accountId, activeHideoutDecorationKey: input.decorationKey, activeStreetSignKey: input.streetSignKey },
      update: { activeHideoutDecorationKey: input.decorationKey, activeStreetSignKey: input.streetSignKey },
    });
    return this.catalog(prisma, accountId);
  },
};
