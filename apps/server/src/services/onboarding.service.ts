import { Prisma, type PrismaClient } from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import {
  ACTIVITY_EXPERIENCE,
  ONBOARDING_GUIDE_STEPS,
  ONBOARDING_PAGE_KEYS,
  TOUR_STEP_KEYS,
  readStreetSignDesign,
  type OnboardingActionInput,
  type OnboardingGuideStepKey,
  type OnboardingPageKey,
  type OnboardingStateDto,
  type TourStepKey,
} from '@streets/shared';
import { RoundService } from './round.service.js';
import { PlayerExperienceService } from './player-experience.service.js';
import { metrics } from './metrics.service.js';

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
  /** The guided walkthrough: started/dismissed state plus a display-step hint. */
  tourStartedAt?: string;
  tourDismissedRoundId?: string | null;
  tourStep?: string;
  signRecapDismissedRoundId?: string | null;
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

/**
 * Positive purchases of a named item, as a single trade or as a checkout line.
 *
 * Store activities are deliberately read from the resolved ledger rather than
 * from client intent. Single trades carry direction/quantity at the top level;
 * checkout activities carry them on each line and may be aggregated as either
 * STORE_BUY or STORE_SELL when a basket contains both directions.
 */
function bought(names: string[]): Prisma.Sql {
  if (!names.length) return Prisma.sql`false`;
  const list = Prisma.join(names);
  return Prisma.sql`(
    (
      a.type::text = 'STORE_BUY'
      AND a.payload->>'item' IN (${list})
      AND a.payload->>'direction' = 'buy'
      AND CASE
        WHEN jsonb_typeof(a.payload->'quantity') = 'number' THEN (a.payload->>'quantity')::float8
        ELSE 0
      END > 0
    )
    OR (a.type::text IN ('STORE_BUY', 'STORE_SELL') AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(a.payload->'lines') = 'array' THEN a.payload->'lines' ELSE '[]'::jsonb END
      ) AS line
      WHERE line->>'item' IN (${list})
        AND line->>'direction' = 'buy'
        AND CASE
          WHEN jsonb_typeof(line->'quantity') = 'number' THEN (line->>'quantity')::float8
          ELSE 0
        END > 0
    ))
  )`;
}

/** What this season's play has already covered. One query over the player's own ledger. */
export async function guideProgress(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  player: { id: string },
  _ruleset: Ruleset,
): Promise<Record<OnboardingGuideStepKey, boolean>> {
  const [row] = await prisma.$queryRaw<Array<Record<'scouted' | 'business' | 'encounter' | 'career', boolean | null>>>(Prisma.sql`
    SELECT
      bool_or(a.type::text = 'SCOUT') AS scouted,
      bool_or(a.type::text = 'BUSINESS_BUILD') AS business,
      bool_or(a.type::text = 'RANDOM_ENCOUNTER_CHOICE') AS encounter,
      bool_or(a.type::text = 'CAREER_CHOSEN') AS career
    FROM "PlayerActivity" a
    WHERE a."roundPlayerId" = ${player.id}
  `);
  return {
    meet_contact: Boolean(row?.scouted),
    open_front: Boolean(row?.business),
    face_encounter: Boolean(row?.encounter),
    choose_career: Boolean(row?.career),
  };
}

/**
 * Guided walkthrough progress: seven ordered core-loop steps, each derived
 * from real ledger-backed play. The raid step accepts any resolved raid
 * attempt (win or loss) so losing never strands the player; recon is taught
 * in the step copy but not gated.
 */
export async function tourProgress(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  player: { id: string; thugs: number },
  ruleset: Ruleset,
  hasSavedSign = false,
): Promise<Record<TourStepKey, boolean>> {
  const eligibleProducts = [...new Set(['CRACK', ...Object.keys(ruleset.products ?? {})])];
  const productList = Prisma.join(eligibleProducts);
  const [row] = await prisma.$queryRaw<Array<Record<'quested' | 'scouted' | 'recruited' | 'hired' | 'condoms' | 'beer' | 'produced' | 'hideout' | 'raided', boolean | null>>>(Prisma.sql`
    SELECT
      bool_or(a.type::text = 'QUEST_ACCEPTED') AS quested,
      bool_or(a.type::text = 'SCOUT') AS scouted,
      bool_or(a.type::text = 'SCOUT' AND jsonb_typeof(a.payload->'thugs') = 'number' AND (a.payload->>'thugs')::float8 > 0) AS recruited,
      bool_or(${bought(itemNames(ruleset, ['thugs']))}) AS hired,
      bool_or(${bought(itemNames(ruleset, ['condoms']))}) AS condoms,
      bool_or(${bought(itemNames(ruleset, ['beer']))}) AS beer,
      bool_or(
        a.type::text = 'PRODUCE_CRACK'
        AND CASE
          WHEN jsonb_typeof(a.payload->'product') = 'number' THEN (a.payload->>'product')::float8
          ELSE 0
        END > 0
        AND COALESCE(NULLIF(a.payload->>'productType', ''), 'CRACK') IN (${productList})
      ) AS produced,
      bool_or(a.type::text = 'HIDEOUT_UPGRADE') AS hideout,
      bool_or(a.type::text = 'RAID_ATTACK') AS raided
    FROM "PlayerActivity" a
    WHERE a."roundPlayerId" = ${player.id}
  `);
  const start = ruleset.round.startingPlayer as unknown as Partial<Record<string, number>>;
  const legacyStepsComplete = Boolean(row?.quested) && Boolean(row?.scouted)
    && Boolean(row?.condoms) && Boolean(row?.beer)
    && (Boolean(row?.recruited) || Boolean(row?.hired) || player.thugs > (start.thugs ?? 0))
    && Boolean(row?.produced) && Boolean(row?.hideout) && Boolean(row?.raided);
  return {
    // Existing graduates keep their completed state when this identity step is added.
    'build-street-sign': hasSavedSign || legacyStepsComplete,
    'accept-quest': Boolean(row?.quested),
    scout: Boolean(row?.scouted),
    'shop-supplies': Boolean(row?.condoms) && Boolean(row?.beer),
    'grow-crew': Boolean(row?.recruited) || Boolean(row?.hired) || player.thugs > (start.thugs ?? 0),
    produce: Boolean(row?.produced),
    'upgrade-hideout': Boolean(row?.hideout),
    'recon-raid': Boolean(row?.raided),
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
    const [value, round, finishedSeasons, profile] = await Promise.all([
      readStored(prisma, accountId),
      RoundService.getCurrent(prisma),
      prisma.roundPlayer.count({ where: { accountId, round: { status: { in: ['ENDED', 'ARCHIVED'] } } } }),
      prisma.accountProfile.findUnique({ where: { accountId }, select: { streetSign: true } }),
    ]);
    const streetSign = readStreetSignDesign(profile?.streetSign);
    const player = round
      ? await prisma.roundPlayer.findUnique({
          where: { roundId_accountId: { roundId: round.id, accountId } },
          select: { id: true, thugs: true, pistols: true, shotguns: true, tek9s: true, ak47s: true },
        })
      : null;

    let guide: OnboardingStateDto['guide'] = null;
    let tour: OnboardingStateDto['tour'] = null;
    if (round && player) {
      const ruleset = loadRulesetForRound(round);
      const progress = await guideProgress(prisma, player, ruleset);
      const steps = ONBOARDING_GUIDE_STEPS.map((key) => ({ key, done: progress[key] }));
      guide = {
        dismissed: value.guideDismissedRoundId === round.id,
        complete: steps.every((step) => step.done),
        steps,
      };
      const tourProgressMap = await tourProgress(prisma, player, ruleset, Boolean(streetSign));
      const tourSteps = TOUR_STEP_KEYS.map((key) => ({ key, done: tourProgressMap[key] }));
      const tourComplete = tourSteps.every((step) => step.done);
      const firstOpen = tourSteps.find((step) => !step.done)?.key ?? null;
      const hinted = (TOUR_STEP_KEYS as readonly string[]).includes(value.tourStep ?? '')
        ? (value.tourStep as TourStepKey)
        : null;
      const hintedOpen = hinted && !tourProgressMap[hinted] ? hinted : null;
      tour = {
        // Veterans are never interrupted: the offer only shows for accounts
        // that have not finished a season and have not started/dismissed it.
        due: !value.tourStartedAt && value.tourDismissedRoundId !== round.id && !tourComplete && finishedSeasons === 0,
        active: Boolean(value.tourStartedAt) && value.tourDismissedRoundId !== round.id && !tourComplete,
        dismissed: value.tourDismissedRoundId === round.id,
        complete: tourComplete,
        step: hintedOpen ?? firstOpen,
        steps: tourSteps,
        signRecap: streetSign && value.signRecapDismissedRoundId !== round.id ? streetSign : null,
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
      tour,
    };
  },

  async update(prisma: PrismaClient, accountId: string, input: OnboardingActionInput, now = new Date()): Promise<OnboardingStateDto> {
    const before = await OnboardingService.state(prisma, accountId);
    const value = await readStored(prisma, accountId);
    const next: StoredOnboarding = { ...value };
    switch (input.action) {
      case 'complete-intro':
        next.introCompletedAt = now.toISOString();
        // Once per account, however many times the intro is replayed.
        await prisma.$transaction((tx) => PlayerExperienceService.award(tx, {
          accountId, sourceKey: 'onboarding-intro', source: 'ONBOARDING', amount: ACTIVITY_EXPERIENCE.onboardingIntro, awardedAt: now,
        }));
        break;
      case 'skip-intro':
        next.introSkippedAt = now.toISOString();
        break;
      case 'replay':
        delete next.introCompletedAt;
        delete next.introSkippedAt;
        next.seenPages = [];
        next.guideDismissedRoundId = null;
        delete next.tourStartedAt;
        next.tourDismissedRoundId = null;
        delete next.tourStep;
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
      case 'start-tour':
        next.tourStartedAt = now.toISOString();
        next.tourDismissedRoundId = null;
        delete next.tourStep;
        // The offer was actionable if the player could start it; avoid counting
        // every repeated onboarding-state GET as a new impression.
        metrics.recordOnboarding('tour_offered');
        metrics.recordOnboarding('tour_started');
        break;
      case 'advance-tour':
        next.tourStep = input.step;
        break;
      case 'dismiss-tour': {
        const round = await RoundService.getCurrent(prisma);
        next.tourDismissedRoundId = round?.id ?? null;
        metrics.recordOnboarding('tour_skipped');
        break;
      }
      case 'restore-tour':
        next.tourDismissedRoundId = null;
        delete next.tourStep;
        break;
      case 'dismiss-sign-recap': {
        const round = await RoundService.getCurrent(prisma);
        next.signRecapDismissedRoundId = round?.id ?? null;
        break;
      }
    }
    await writeStored(prisma, accountId, next);
    const after = await OnboardingService.state(prisma, accountId);
    const beforeSteps = new Map(before.tour?.steps.map((step) => [step.key, step.done]) ?? []);
    for (const step of after.tour?.steps ?? []) {
      if (!beforeSteps.get(step.key) && step.done) metrics.recordOnboarding('step_completed', step.key);
    }
    if (!before.tour?.complete && after.tour?.complete) metrics.recordOnboarding('chapter_graduated');
    if (input.action === 'advance-tour' && after.tour?.steps.find((step) => step.key === input.step)?.done) {
      metrics.recordOnboarding('step_blocked', input.step);
    }
    return after;
  },
};
