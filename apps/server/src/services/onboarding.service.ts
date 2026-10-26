import { Prisma, type PrismaClient } from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import {
  ACTIVITY_EXPERIENCE,
  ONBOARDING_PAGE_KEYS,
  readStreetSignDesign,
  type OnboardingActionInput,
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
  /** The guided walkthrough: started/dismissed state plus a display-step hint. */
  tourStartedAt?: string;
  tourDismissedRoundId?: string | null;
  tourStep?: string;
  signRecapDismissedRoundId?: string | null;
  /** Internal one-shot markers used only to avoid double-counting aggregate timings. */
  tourFirstActionRecordedAt?: string;
  tourFirstRewardRecordedAt?: string;
}

function stored(value: unknown): StoredOnboarding {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as StoredOnboarding : {};
}

/** Coarse, privacy-safe timing buckets for aggregate onboarding telemetry. */
function onboardingTimingBucket(startedAt: string | undefined, now: Date): string | null {
  if (!startedAt) return null;
  const elapsedMs = now.getTime() - Date.parse(startedAt);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  if (elapsedMs < 60_000) return '<1m';
  if (elapsedMs < 3 * 60_000) return '1-3m';
  if (elapsedMs < 5 * 60_000) return '3-5m';
  if (elapsedMs < 10 * 60_000) return '5-10m';
  if (elapsedMs < 15 * 60_000) return '10-15m';
  if (elapsedMs < 30 * 60_000) return '15-30m';
  return '30m+';
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

/**
 * Guided walkthrough progress: ordered early-game teaching steps, each derived
 * from real ledger-backed play. It intentionally does not read story quests.
 * A resolved raid attempt (win or loss) completes the final step so losing
 * never strands the player.
 */
export async function tourProgress(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  player: { id: string; thugs: number; condoms?: number; beer?: number; medicine?: number; pistols?: number; ammo?: number },
  ruleset: Ruleset,
  hasSavedSign = false,
): Promise<Record<TourStepKey, boolean>> {
  const eligibleProducts = [...new Set(['CRACK', ...Object.keys(ruleset.products ?? {})])];
  const productList = Prisma.join(eligibleProducts);
  const [row] = await prisma.$queryRaw<Array<Record<'scouted' | 'payout' | 'recruited' | 'hired' | 'condoms' | 'beer' | 'produced' | 'hideout' | 'recon' | 'raided', boolean | number | null>>>(Prisma.sql`
    SELECT
       bool_or(a.type::text = 'SCOUT') AS scouted,
       bool_or(a.type::text = 'SCOUT' AND jsonb_typeof(a.payload->'cashCents') = 'number' AND (a.payload->>'cashCents')::float8 > 0) AS payout,
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
        bool_or(a.type::text = 'COMBAT_RECON') AS recon,
         bool_or(a.type::text = 'RAID_ATTACK') AS raided
    FROM "PlayerActivity" a
    WHERE a."roundPlayerId" = ${player.id}
  `);
  const start = ruleset.round.startingPlayer as unknown as Partial<Record<string, number>>;
  const legacyStepsComplete = Boolean(row?.scouted)
    && Boolean(row?.condoms) && Boolean(row?.beer)
    && (Boolean(row?.recruited) || Boolean(row?.hired) || player.thugs > (start.thugs ?? 0))
    && Boolean(row?.produced) && Boolean(row?.hideout) && Boolean(row?.raided);
  const suppliesComplete = Number(player.condoms ?? 0) >= 1_000
    && Number(player.beer ?? 0) >= 1_000
    && Number(player.medicine ?? 0) >= 15
    && Number(player.pistols ?? 0) >= 5
    && Number(player.ammo ?? 0) >= 10_000;
  return {
    // Existing graduates keep their completed state when this identity step is added.
    'build-street-sign': hasSavedSign || legacyStepsComplete,
    'scout-streets': Boolean(row?.scouted),
    'earn-first-payout': Boolean(row?.payout),
    // These are five presentation prompts backed by one current-inventory milestone.
    // Ammo Crates are stored as rounds, so one crate is 10,000 ammo.
    'buy-condoms': suppliesComplete,
    'buy-beer': suppliesComplete,
    'buy-medicine': suppliesComplete,
    'buy-pistols': suppliesComplete,
    'buy-ammo-crate': suppliesComplete,
    'grow-crew': Boolean(row?.recruited) || Boolean(row?.hired) || player.thugs > (start.thugs ?? 0),
    produce: Boolean(row?.produced),
    'upgrade-hideout': Boolean(row?.hideout),
    'recon-rival': Boolean(row?.recon),
    'first-raid': Boolean(row?.raided),
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
          select: { id: true, thugs: true, pistols: true, shotguns: true, tek9s: true, ak47s: true, condoms: true, beer: true, medicine: true, ammo: true },
        })
      : null;

    let tour: OnboardingStateDto['tour'] = null;
    if (round && player) {
      const ruleset = loadRulesetForRound(round);
      const tourProgressMap = await tourProgress(prisma, player, ruleset, Boolean(streetSign));
      // Keep the opening walkthrough focused on identity, a first result, and
      // one operation decision. The remaining lessons stay available in their
      // own page guides and never hold the opening loop hostage.
      const coreTourStepKeys: readonly TourStepKey[] = [
        'build-street-sign',
        'scout-streets',
        'earn-first-payout',
        'grow-crew',
      ];
      const tourSteps = coreTourStepKeys.map((key) => ({ key, done: tourProgressMap[key] }));
      const tourComplete = tourSteps.every((step) => step.done);
      const firstOpen = tourSteps.find((step) => !step.done)?.key ?? null;
      const hinted = coreTourStepKeys.includes(value.tourStep as TourStepKey)
        ? (value.tourStep as TourStepKey)
        : null;
      // Keep an explicit display hint even when its action is complete so the
      // walkthrough arrows can revisit adjacent steps. When no hint exists,
      // default to the first incomplete step.
      const hintedOpen = hinted;
      tour = {
        // Veterans are never interrupted: the offer only shows for accounts
        // that have not finished a season and have not started/dismissed it.
        due: !value.tourStartedAt && value.tourDismissedRoundId !== round.id && !tourComplete && finishedSeasons === 0,
        active: Boolean(value.tourStartedAt) && value.tourDismissedRoundId !== round.id && !tourComplete,
        dismissed: value.tourDismissedRoundId === round.id,
        complete: tourComplete,
        step: hintedOpen ?? firstOpen,
        steps: tourSteps,
        signRecap: tourComplete && streetSign && value.signRecapDismissedRoundId !== round.id ? streetSign : null,
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
        delete next.tourStartedAt;
        next.tourDismissedRoundId = null;
        delete next.tourStep;
        delete next.tourFirstActionRecordedAt;
        delete next.tourFirstRewardRecordedAt;
        break;
      case 'see-page':
        next.seenPages = [...new Set([...(value.seenPages ?? []), input.page])].filter((key): key is OnboardingPageKey =>
          (ONBOARDING_PAGE_KEYS as readonly string[]).includes(key));
        break;
      case 'start-tour':
        if (before.tour?.dismissed && value.tourStartedAt) metrics.recordOnboarding('tour_returned');
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
        // The current display step makes dismissal useful for finding drop-off points.
        metrics.recordOnboarding('tour_skipped', before.tour?.step ?? undefined);
        break;
      }
      case 'restore-tour':
        if (before.tour?.dismissed && value.tourStartedAt) metrics.recordOnboarding('tour_returned');
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
    const newlyCompleted = (after.tour?.steps ?? [])
      .filter((step) => !beforeSteps.get(step.key) && step.done)
      .map((step) => step.key);
    for (const step of newlyCompleted) {
      metrics.recordOnboarding('step_completed', step);
    }
    const timingBucket = onboardingTimingBucket(next.tourStartedAt, now);
    if (timingBucket && newlyCompleted.length > 0 && !value.tourFirstActionRecordedAt) {
      metrics.recordOnboarding('tour_first_action', timingBucket);
      next.tourFirstActionRecordedAt = now.toISOString();
    }
    if (timingBucket && newlyCompleted.includes('earn-first-payout') && !value.tourFirstRewardRecordedAt) {
      metrics.recordOnboarding('tour_first_reward', timingBucket);
      next.tourFirstRewardRecordedAt = now.toISOString();
    }
    if (next.tourFirstActionRecordedAt !== value.tourFirstActionRecordedAt
      || next.tourFirstRewardRecordedAt !== value.tourFirstRewardRecordedAt) {
      await writeStored(prisma, accountId, next);
    }
    if (!before.tour?.complete && after.tour?.complete) {
      metrics.recordOnboarding('chapter_graduated');
      metrics.recordOnboarding('tour_completed');
    }
    if (input.action === 'advance-tour' && after.tour?.steps.find((step) => step.key === input.step)?.done) {
      metrics.recordOnboarding('step_blocked', input.step);
    }
    return after;
  },
};
