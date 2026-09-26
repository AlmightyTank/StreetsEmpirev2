import { Prisma, type PrismaClient } from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import {
  ONBOARDING_GUIDE_STEPS,
  ONBOARDING_PAGE_KEYS,
  type OnboardingActionInput,
  type OnboardingGuideStepKey,
  type OnboardingPageKey,
  type OnboardingStateDto,
} from '@streets/shared';
import { RoundService } from './round.service.js';

/**
 * 1.0.0-B. Tutorial progress and the early "getting started" goals.
 *
 * Progress is account-level so it follows a player across devices and seasons.
 * The goals are instructional only: they read what the player has actually done
 * this season, never grant anything, and never block an action.
 */

interface StoredOnboarding {
  introCompletedAt?: string;
  introSkippedAt?: string;
  seenPages?: string[];
  /** The round the guide was dismissed for; a new season shows it again. */
  guideDismissedRoundId?: string | null;
}

function stored(value: unknown): StoredOnboarding {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as StoredOnboarding : {};
}

/** Item names in this ruleset's shops that put stock in one of these fields. */
function itemNames(ruleset: Ruleset, fields: string[]): string[] {
  const names = new Set<string>();
  for (const store of Object.values(ruleset.stores)) {
    for (const item of Object.values(store.items)) {
      if (fields.includes(item.field)) names.add(item.name);
    }
  }
  return [...names];
}

/** Store buys of a named item, as a single trade or as a line of a checkout. */
function bought(names: string[]): Prisma.Sql {
  if (!names.length) return Prisma.sql`false`;
  const list = Prisma.join(names);
  return Prisma.sql`(
    (a.type::text = 'STORE_BUY' AND a.payload->>'item' IN (${list}))
    OR (a.type::text IN ('STORE_BUY', 'STORE_SELL') AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(a.payload->'lines') = 'array' THEN a.payload->'lines' ELSE '[]'::jsonb END
      ) AS line
      WHERE line->>'item' IN (${list}) AND line->>'direction' = 'buy'
    ))
  )`;
}

/** What this season's play has already covered. One query over the player's own ledger. */
export async function guideProgress(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  player: { id: string; thugs: number; pistols: number; shotguns: number; tek9s: number; ak47s: number },
  ruleset: Ruleset,
): Promise<Record<OnboardingGuideStepKey, boolean>> {
  const weaponFields = ['pistols', 'shotguns', 'tek9s', 'ak47s'] as const;
  const [row] = await prisma.$queryRaw<Array<Record<'scouted' | 'recruited' | 'hired' | 'produced' | 'condoms' | 'beer' | 'armed', boolean | null>>>(Prisma.sql`
    SELECT
      bool_or(a.type::text = 'SCOUT') AS scouted,
      bool_or(a.type::text = 'SCOUT' AND jsonb_typeof(a.payload->'thugs') = 'number' AND (a.payload->>'thugs')::float8 > 0) AS recruited,
      bool_or(${bought(itemNames(ruleset, ['thugs']))}) AS hired,
      bool_or(a.type::text = 'PRODUCE_CRACK') AS produced,
      bool_or(${bought(itemNames(ruleset, ['condoms']))}) AS condoms,
      bool_or(${bought(itemNames(ruleset, ['beer']))}) AS beer,
      bool_or(${bought(itemNames(ruleset, [...weaponFields]))}) AS armed
    FROM "PlayerActivity" a
    WHERE a."roundPlayerId" = ${player.id}
  `);
  // Every crew starts with some thugs and guns; only growth beyond that counts.
  const start = ruleset.round.startingPlayer as unknown as Partial<Record<string, number>>;
  const startingWeapons = weaponFields.reduce((sum, field) => sum + (start[field] ?? 0), 0);
  const weapons = weaponFields.reduce((sum, field) => sum + player[field], 0);
  return {
    scout: Boolean(row?.scouted),
    // Hired, recruited or rewarded: any thug beyond the crew every player starts with.
    recruit: Boolean(row?.recruited) || Boolean(row?.hired) || player.thugs > (start.thugs ?? 0),
    restock: Boolean(row?.condoms) && Boolean(row?.beer),
    produce: Boolean(row?.produced),
    weapon: Boolean(row?.armed) || weapons > startingWeapons,
  };
}

async function readStored(prisma: PrismaClient, accountId: string): Promise<StoredOnboarding> {
  const profile = await prisma.accountProfile.findUnique({ where: { accountId }, select: { onboarding: true } });
  return stored(profile?.onboarding);
}

async function writeStored(prisma: PrismaClient, accountId: string, value: StoredOnboarding): Promise<void> {
  const onboarding = value as Prisma.InputJsonValue;
  await prisma.accountProfile.upsert({
    where: { accountId },
    create: { accountId, onboarding },
    update: { onboarding },
  });
}

export const OnboardingService = {
  async state(prisma: PrismaClient, accountId: string): Promise<OnboardingStateDto> {
    const [value, round, finishedSeasons] = await Promise.all([
      readStored(prisma, accountId),
      RoundService.getCurrent(prisma),
      prisma.roundPlayer.count({ where: { accountId, round: { status: { in: ['ENDED', 'ARCHIVED'] } } } }),
    ]);
    const player = round
      ? await prisma.roundPlayer.findUnique({
          where: { roundId_accountId: { roundId: round.id, accountId } },
          select: { id: true, thugs: true, pistols: true, shotguns: true, tek9s: true, ak47s: true },
        })
      : null;

    let guide: OnboardingStateDto['guide'] = null;
    if (round && player) {
      const progress = await guideProgress(prisma, player, loadRulesetForRound(round));
      const steps = ONBOARDING_GUIDE_STEPS.map((key) => ({ key, done: progress[key] }));
      guide = {
        dismissed: value.guideDismissedRoundId === round.id,
        complete: steps.every((step) => step.done),
        steps,
      };
    }

    const seen = new Set(value.seenPages ?? []);
    return {
      intro: {
        // Veterans are never interrupted: the intro opens by itself only for accounts
        // that have not finished a season and have neither finished nor skipped it.
        due: !value.introCompletedAt && !value.introSkippedAt && finishedSeasons === 0,
        completedAt: value.introCompletedAt ?? null,
        skippedAt: value.introSkippedAt ?? null,
      },
      seenPages: ONBOARDING_PAGE_KEYS.filter((key) => seen.has(key)),
      guide,
    };
  },

  async update(prisma: PrismaClient, accountId: string, input: OnboardingActionInput, now = new Date()): Promise<OnboardingStateDto> {
    const value = await readStored(prisma, accountId);
    const next: StoredOnboarding = { ...value };
    switch (input.action) {
      case 'complete-intro':
        next.introCompletedAt = now.toISOString();
        break;
      case 'skip-intro':
        next.introSkippedAt = now.toISOString();
        break;
      case 'replay':
        delete next.introCompletedAt;
        delete next.introSkippedAt;
        next.seenPages = [];
        next.guideDismissedRoundId = null;
        break;
      case 'see-page':
        next.seenPages = [...new Set([...(value.seenPages ?? []), input.page])].filter((key): key is OnboardingPageKey =>
          (ONBOARDING_PAGE_KEYS as readonly string[]).includes(key));
        break;
      case 'dismiss-guide': {
        const round = await RoundService.getCurrent(prisma);
        next.guideDismissedRoundId = round?.id ?? null;
        break;
      }
      case 'restore-guide':
        next.guideDismissedRoundId = null;
        break;
    }
    await writeStored(prisma, accountId, next);
    return OnboardingService.state(prisma, accountId);
  },
};
