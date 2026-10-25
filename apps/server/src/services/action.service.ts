import type {
  ActivityType,
  City,
  Prisma,
  PrismaClient,
  Round,
  RoundPlayer,
} from '@prisma/client';
import { loadRulesetForRound, rulesetForCity, totalWeapons, type Ruleset, type Standings } from '@streets/rules-engine';
import type {
  GameActionResult,
  PlayerSnapshot,
  RankChanges,
  ResourceChange,
} from '@streets/shared';
import { streetSkillPaysAtLaunch, streetSkillSourceForAction, type QuestDataValue } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { annotateLogContext } from '../utils/request-context.js';
import { ActivityService } from './activity.service.js';
import { RandomEncounterService, encounterActivityPayload } from './random-encounter.service.js';
import { HappinessService } from './happiness.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { assertLoanDebtChange, assertPlayerState } from './invariant.service.js';
import { NetWorthService } from './net-worth.service.js';
import { RankingService } from './ranking.service.js';
import { TurnService } from './turn.service.js';
import { ReputationService, type ReputationChange } from './reputation.service.js';
import { StockService, type StockSettlementSet } from './stock.service.js';
import { CombatRecoveryService, type RecoverySettlement } from './combat-recovery.service.js';
import { ConvoyService } from './convoy.service.js';
import { RelocationService } from './relocation.service.js';
import { BossTripSettleService } from './boss-trip-settle.service.js';
import { RunSettleService } from './run-settle.service.js';
import { TurfService } from './turf.service.js';
import { BusinessService } from './business.service.js';
import { SupplyPropertySettleService } from './supply-property-settle.service.js';
import { DealerSalesSettleService } from './dealer-sales-settle.service.js';
import { SupplyLaneSettleService } from './supply-lane-settle.service.js';
import { LoanSettleService } from './loan-settle.service.js';
import { TurfWarSettlementService } from './turf-war-settle.service.js';
import { HideoutBuildService } from './hideout-build.service.js';
import { QuestProgressService } from './quest-progress.service.js';
import { EconomyLedgerService, type EconomyLedgerWrite } from './economy-ledger.service.js';
import { StreetPassCredService } from './street-pass-cred.service.js';
import { consumeGeneratorFuel } from './generator.service.js';
import { recordHideoutEconomy } from './hideout-economy-telemetry.service.js';
import { LawService, type CaseEvidence } from './law.service.js';
import { LawWarrantService } from './law-warrant.service.js';
import { CrewRosterService } from './crew-roster.service.js';
import { CrewStaffingOrderService } from './crew-staffing-order.service.js';
import { fitThugs } from './crew-availability.js';
import { coolHeat, PlayerSkillService, type SkillEffects, type SkillXpAward } from './player-skill.service.js';

export { fitThugs, workingWhores } from './crew-availability.js';

function typicalSquadAmmo(state: PlayerState, ruleset: Ruleset): number {
  const rounds = ruleset.ammoParts?.ammo.roundsPerFight;
  if (!rounds) return 0;
  const armed = [
    [state.ak47s, rounds.AK47], [state.tek9s, rounds.TEK9],
    [state.shotguns, rounds.SHOTGUN], [state.pistols, rounds.PISTOL],
  ] as const;
  let remaining = Math.min(fitThugs(state), ruleset.combat?.squadCap ?? Number.MAX_SAFE_INTEGER);
  let total = 0;
  for (const [count, cost] of armed) {
    const assigned = Math.min(remaining, count);
    total += assigned * cost;
    remaining -= assigned;
  }
  return total;
}

async function casinoCashEquivalentCents(tx: Db, roundPlayerId: string, ruleset: Ruleset): Promise<bigint> {
  if (!ruleset.casino?.enabled) return 0n;
  const [wallets, sessions, sportsbook] = await Promise.all([
    tx.casinoWallet.aggregate({ where: { roundPlayerId }, _sum: { chipsCents: true } }),
    tx.casinoSession.aggregate({ where: { roundPlayerId, status: 'OPEN' }, _sum: { bankrollCents: true } }),
    tx.sportsbookBet.aggregate({ where: { roundPlayerId, status: 'OPEN', casinoCityId: { not: null } }, _sum: { stakeCents: true } }),
  ]);
  return (wallets._sum.chipsCents ?? 0n) + (sessions._sum.bankrollCents ?? 0n) + (sportsbook._sum.stakeCents ?? 0n);
}

/**
 * Everything an action is allowed to move. Turn-settled before an action sees
 * it, and the only thing an action may hand back.
 */
export interface PlayerState {
  cashCents: bigint;
  turns: number;
  payoutPercent: number;

  whores: number;
  thugs: number;
  woundedThugs: number;

  condoms: number;
  medicine: number;
  crack: number;
  beer: number;

  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;
  /** 2.4.0-C. Versioned stores add these only to rulesets that enable the catalog. */
  ammo?: number;
  vehicleParts?: number;
  ammoStock?: number;
  vehiclePartsStock?: number;

  lowRiders: number;
  sedans: number;
  vans: number;
  /** 1.5.0-C. Out of action until the garage repairs or recovers them. */
  damagedLowRiders: number;
  damagedSedans: number;
  damagedVans: number;
  disabledLowRiders: number;
  disabledSedans: number;
  disabledVans: number;

  /** Weapon access, earned with reputation and never revoked. */
  shotgunUnlocked: boolean;
  tek9Unlocked: boolean;
  ak47Unlocked: boolean;

  /** 0.4.0-C. Settled Heat: decayed on the turn clock before an action sees it. Always 0 without Heat. */
  heat: number;
  /** 0.5.0-B. Net worth of what is out on a run. Runs move it; nothing else does. */
  awayNetWorthCents: bigint;
  /** 0.6.0-B/C. Net worth of turf-deployed guns removed from the home arsenal. */
  postedNetWorthCents: bigint;
  /** 0.6.0-D. Net worth stored in away outpost boxes. */
  outpostNetWorthCents: bigint;
  /** 1.6.5-A. Owed to the loan shark. Only loan acceptance and repayment move it. */
  loanDebtCents: bigint;
  /** 0.5.0-C. Set by an arrest at home; left out, it is not written. */
  lockedUntil?: Date | null;
  /** 0.5.0-D. Set by a move; left out, it is not written. */
  movingUntil?: Date | null;
  /** 0.5.0-E. Thugs on a tail or convoy backup: counted, never fit. */
  busyThugs: number;
  /** 0.6.0-A. Thugs on held corners: counted, never fit at home. */
  postedThugs: number;
  /** 1.1.0-B. Thugs and girls working a business: counted, never fit or working at home. */
  businessThugs: number;
  /** 1.6.0-A. Thugs assigned to dealer crews: counted, never available at home. */
  dealerThugs: number;
  businessWhores: number;

  /** Quest progress that is per-player rather than per-trader. */
  cleanShiftStreak: number;
  rocksSuppliedToPip: number;
  driveBysDone: number;
  condomsBought: number;
  medicineBought: number;
  beerBought: number;
  pistolsBought: number;
  raidsDone: number;

  /** Seasonal hideout rooms. Reset by new round-player rows. */
  hideoutSafeRoomLevel: number;
  hideoutLookoutsLevel: number;
  hideoutWorkshopLevel: number;
  hideoutBackOfficeLevel: number;
  hideoutGarageLevel: number;
  hideoutStorageLevel?: number;
  /** The room under construction, if any; its level lands when the build is ready. */
  hideoutBuildRoom?: string | null;
  hideoutBuildLevel?: number | null;
  hideoutBuildStartedAt?: Date | null;
  hideoutBuildReadyAt?: Date | null;
  hideoutWeaponPriority: string;
  hideoutSafeRoomSpecialization: string | null;
  hideoutLookoutsSpecialization: string | null;
  hideoutWorkshopSpecialization: string | null;
  hideoutBackOfficeSpecialization: string | null;

  /**
   * What Tommy has on the shelf, already settled. Counters rather than
   * resources: they never reach a snapshot, and an action spends them the
   * same way it spends turns.
   */
  pistolStock: number;
  shotgunStock: number;
  tek9Stock: number;
  ak47Stock: number;
  lowRiderStock: number;
  condomStock: number;
  medicineStock: number;
  beerStock: number;
  crackStock: number;
  thugStock: number;

  /** 2.3.0. Hideout generator state; fuel is charged per spent game turn. */
  generatorPowered?: boolean;
  generatorFuel?: number;
  generatorCapacityLevel?: number;
  generatorEfficiencyLevel?: number;
  scavengedComponents?: Prisma.InputJsonValue;
  /** The Board C. Read-only here: only the Board service moves parts in and out of escrow. */
  playerBoardEscrow?: Prisma.InputJsonValue;
}

export interface ActionContext {
  /** The action's transaction, with the player already locked. For product rows; everything else goes in `next`. */
  tx: Db;
  /** Turn-settled, happiness and net worth already true for these numbers. */
  current: PlayerState;
  whoreHappiness: number;
  thugHappiness: number;
  player: RoundPlayer & { city: City };
  round: Round;
  ruleset: Ruleset;
  now: Date;
  /** Settled shop shelves, for actions that need to explain the wait. */
  stock: StockSettlementSet;
  /** Standing with each trader, as it stands before the action. */
  standings: Standings;
  recovery: RecoverySettlement;
  /** 1.6.5-B. Net worth as it stands before the action, freshly calculated. */
  netWorthCents: bigint;
  /** Street skill passives and perks. Ask for an effect where it applies; it lands on the receipt. */
  skills: SkillEffects;
}

export interface ActionOutcome<T> {
  next: PlayerState;
  result: T;
  /** Left out by actions too small for the feed, like one trade on a run. */
  activity?: { type: ActivityType; payload: Prisma.InputJsonValue };
  /** Optional richer quest-only signal for actions intentionally omitted from the activity feed. */
  questProgress?: { type: string; payload: QuestDataValue };
  /** Economic lines to record in the 0.7-E Back Office ledger. Omit for the action's home-cash delta fallback. */
  ledger?: EconomyLedgerWrite[];
  /**
   * Standing to write alongside the player, in the same transaction. Actions
   * that do not touch reputation leave this out.
   */
  reputation?: ReputationChange[];
  /**
   * 1.3.0-A/B. What the action leaves on the player's Case, by city: Heat it drew, direct
   * evidence and cash it moved. An entry with no city is the player's home. Keys come from
   * the action id, so a replay never adds evidence twice.
   */
  caseEvidence?: Array<Omit<CaseEvidence, 'sourceKey'>>;
  /** Slice A: XP is written only after the action has settled successfully. */
  skillXp?: readonly SkillXpAward[];
}

function encounterTriggerForAction(action: string): 'STORE' | 'TURF' | null {
  if (action.startsWith('STORE_')) return 'STORE';
  if (action.startsWith('TURF_')) return 'TURF';
  return null;
}

function activityPayloadWithEncounter(payload: Prisma.InputJsonValue, encounter: import('@streets/shared').RandomEncounterDto): Prisma.InputJsonValue {
  const base = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Prisma.InputJsonObject
    : { value: payload };
  return { ...base, randomEncounter: encounterActivityPayload(encounter) };
}

export interface RunActionOptions<T> {
  /** Name carried in the result, e.g. "SCOUT". */
  action: string;
  /** Client generated id. Section 52. */
  actionId?: string;
  /**
   * Optional narrower replay namespace. The public result still reports
   * `action`; this only prevents one request id from replaying a different
   * resource-changing sub-action that happens to share the same action label.
   */
  idempotencyScope?: string;
  execute: (context: ActionContext) => ActionOutcome<T> | Promise<ActionOutcome<T>>;
}

/**
 * Section 50. The turn error a player can actually act on.
 */
export function assertTurns(available: number, requested: number): void {
  if (requested > available) {
    throw AppError.badRequest(
      'NOT_ENOUGH_TURNS',
      `You tried to spend ${requested} ${requested === 1 ? 'Turn' : 'Turns'}, but only ${available} ${available === 1 ? 'is' : 'are'} available.`,
      { turns: `Only ${available} available.` },
    );
  }
}

/** The action pipeline's view of a stored player. Also what the store reads. */
export function toState(player: RoundPlayer): PlayerState {
  return {
    cashCents: player.cashCents,
    turns: player.turns,
    payoutPercent: player.payoutPercent,
    whores: player.whores,
    thugs: player.thugs,
    woundedThugs: player.woundedThugs,
    condoms: player.condoms,
    medicine: player.medicine,
    crack: player.crack,
    beer: player.beer,
    pistols: player.pistols,
    shotguns: player.shotguns,
    tek9s: player.tek9s,
    ak47s: player.ak47s,
    ammo: player.ammo,
    vehicleParts: player.vehicleParts,
    lowRiders: player.lowRiders,
    sedans: player.sedans,
    vans: player.vans,
    damagedLowRiders: player.damagedLowRiders,
    damagedSedans: player.damagedSedans,
    damagedVans: player.damagedVans,
    disabledLowRiders: player.disabledLowRiders,
    disabledSedans: player.disabledSedans,
    disabledVans: player.disabledVans,
    shotgunUnlocked: player.shotgunUnlocked,
    tek9Unlocked: player.tek9Unlocked,
    ak47Unlocked: player.ak47Unlocked,
    heat: player.heat,
    awayNetWorthCents: player.awayNetWorthCents,
    postedNetWorthCents: player.postedNetWorthCents,
    outpostNetWorthCents: player.outpostNetWorthCents,
    loanDebtCents: player.loanDebtCents,
    busyThugs: player.busyThugs,
    postedThugs: player.postedThugs,
    businessThugs: player.businessThugs,
    dealerThugs: player.dealerThugs,
    businessWhores: player.businessWhores,
    cleanShiftStreak: player.cleanShiftStreak,
    rocksSuppliedToPip: player.rocksSuppliedToPip,
    driveBysDone: player.driveBysDone,
    condomsBought: player.condomsBought,
    medicineBought: player.medicineBought,
    beerBought: player.beerBought,
    pistolsBought: player.pistolsBought,
    raidsDone: player.raidsDone,
    hideoutSafeRoomLevel: player.hideoutSafeRoomLevel,
    hideoutLookoutsLevel: player.hideoutLookoutsLevel,
    hideoutWorkshopLevel: player.hideoutWorkshopLevel,
    hideoutBackOfficeLevel: player.hideoutBackOfficeLevel,
    hideoutGarageLevel: player.hideoutGarageLevel,
    hideoutStorageLevel: player.hideoutStorageLevel,
    hideoutBuildRoom: player.hideoutBuildRoom,
    hideoutBuildLevel: player.hideoutBuildLevel,
    hideoutBuildStartedAt: player.hideoutBuildStartedAt,
    hideoutBuildReadyAt: player.hideoutBuildReadyAt,
    hideoutWeaponPriority: player.hideoutWeaponPriority,
    hideoutSafeRoomSpecialization: player.hideoutSafeRoomSpecialization,
    hideoutLookoutsSpecialization: player.hideoutLookoutsSpecialization,
    hideoutWorkshopSpecialization: player.hideoutWorkshopSpecialization,
    hideoutBackOfficeSpecialization: player.hideoutBackOfficeSpecialization,
    pistolStock: player.pistolStock,
    shotgunStock: player.shotgunStock,
    tek9Stock: player.tek9Stock,
    ak47Stock: player.ak47Stock,
    lowRiderStock: player.lowRiderStock,
    condomStock: player.condomStock,
    medicineStock: player.medicineStock,
    beerStock: player.beerStock,
    crackStock: player.crackStock,
    thugStock: player.thugStock,
    generatorPowered: player.generatorPowered,
    generatorFuel: player.generatorFuel,
    generatorCapacityLevel: player.generatorCapacityLevel,
    generatorEfficiencyLevel: player.generatorEfficiencyLevel,
    scavengedComponents: player.scavengedComponents as Prisma.InputJsonValue,
    playerBoardEscrow: player.playerBoardEscrow as Prisma.InputJsonValue,
  };
}

function armedThugsForSnapshot(state: PlayerState): number {
  return Math.min(fitThugs(state), totalWeapons(state));
}

function toSnapshot(
  state: PlayerState,
  happiness: { whoreHappiness: number; thugHappiness: number },
  netWorthCents: bigint,
): PlayerSnapshot {
  return {
    cashCents: Number(state.cashCents),
    netWorthCents: Number(netWorthCents),
    turns: state.turns,
    whoreHappiness: happiness.whoreHappiness,
    thugHappiness: happiness.thugHappiness,
    resources: {
      cashCents: Number(state.cashCents),
      whores: state.whores,
      thugs: state.thugs,
      fitThugs: fitThugs(state),
      woundedThugs: state.woundedThugs,
      postedThugs: state.postedThugs,
      businessThugs: state.businessThugs,
      dealerThugs: state.dealerThugs,
      businessWhores: state.businessWhores,
      armedThugs: armedThugsForSnapshot(state),
      unarmedThugs: Math.max(0, fitThugs(state) - armedThugsForSnapshot(state)),
      condoms: state.condoms,
      medicine: state.medicine,
      product: state.crack,
      crack: state.crack,
      beer: state.beer,
      pistols: state.pistols,
      shotguns: state.shotguns,
      tek9s: state.tek9s,
      ak47s: state.ak47s,
      lowRiders: state.lowRiders,
      sedans: state.sedans,
      vans: state.vans,
    },
  };
}

/** Section 44. Only what actually moved. */
function diff(before: PlayerSnapshot, after: PlayerSnapshot): ResourceChange[] {
  const changes: ResourceChange[] = [];

  const push = (resource: string, from: number, to: number) => {
    if (from !== to) changes.push({ resource, before: from, after: to, change: to - from });
  };

  push('turns', before.turns, after.turns);
  push('cashCents', before.cashCents, after.cashCents);
  push('netWorthCents', before.netWorthCents, after.netWorthCents);
  push('whoreHappiness', before.whoreHappiness, after.whoreHappiness);
  push('thugHappiness', before.thugHappiness, after.thugHappiness);

  for (const key of Object.keys(before.resources) as (keyof typeof before.resources)[]) {
    if (key === 'cashCents') continue; // already reported above
    if (key === 'product') continue; // alias for crack during the product migration
    push(key, before.resources[key] ?? 0, after.resources[key] ?? 0);
  }

  return changes;
}

/**
 * Runs one resource-changing action. Section 51, end to end:
 *
 *   begin transaction -> lock the player -> replay guard -> refresh turns ->
 *   validate -> calculate -> apply -> recalculate happiness -> recalculate
 *   net worth -> recalculate ranks -> write activity -> commit
 *
 * The action itself only decides what the numbers become. It never touches
 * happiness, net worth, ranks, the clock or the database.
 */
export const ActionService = {
  async run<T>(
    prisma: PrismaClient,
    roundPlayerId: string,
    options: RunActionOptions<T>,
    now: Date = new Date(),
  ): Promise<GameActionResult<T>> {
    await TurfWarSettlementService.settleDueFor(prisma, roundPlayerId, now);
    return prisma.$transaction(async (tx) => {
      // The lock comes first. Checking for a replay before taking it lets two
      // concurrent duplicates both look, both find nothing, and both execute.
      await lockRoundPlayer(tx, roundPlayerId);

      const idempotencyAction = options.idempotencyScope ?? options.action;
      if (options.actionId) {
        const replay = await IdempotencyService.find<GameActionResult<T>>(
          tx,
          options.actionId,
          roundPlayerId,
          idempotencyAction,
        );
        // Section 52: the same action id answers with the original result
        // rather than executing a second time.
        if (replay) return replay;
      }

      // 0.5.0-B: a run that is due home is home before anything reads the player.
      await RunSettleService.settle(tx, roundPlayerId, now);
      // 0.5.0-D: and a move that has arrived has arrived.
      await RelocationService.settleOwn(tx, roundPlayerId, now);
      // Trips A/C: a boss whose flight home has landed is home, and whatever a hit on a
      // visiting boss brought back is back.
      await BossTripSettleService.settleAndCredit(tx, roundPlayerId, now);
      // 0.5.0-E: and whatever came back from a convoy fight is back.
      await ConvoyService.credit(tx, roundPlayerId, now);
      // 0.6.0-C: turf squads and allied backup return before another action reads them.
      await TurfWarSettlementService.credit(tx, roundPlayerId, now);
      // Hideout construction that has finished lands before the player is read.
      await HideoutBuildService.settle(tx, roundPlayerId, now);

      const loaded = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        include: { city: true, round: true },
      });
      if (!loaded) {
        throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
      }

      const { round, ...loadedPlayer } = loaded;
      // 1.0.0-F: the action's identity, on every log line it produces.
      annotateLogContext({ roundPlayerId, roundId: round.id, actionId: options.actionId, action: options.action, ruleset: `${round.rulesetId}@${round.rulesetVersion}` });
      let player = loadedPlayer;
      assertRoundPlayable(round, now);
      // 0.5.0-C: nobody acts from a cell. A run still out comes home on its own.
      if (player.lockedUntil && player.lockedUntil.getTime() > now.getTime()) {
        const minutes = Math.ceil((player.lockedUntil.getTime() - now.getTime()) / 60_000);
        throw AppError.conflict('LOCKED_UP', `You are locked up for another ${minutes} minute${minutes === 1 ? '' : 's'}. Nothing moves until you are out.`);
      }
      // 0.5.0-D: nor from the cab of a moving truck.
      if (player.movingUntil && player.movingUntil.getTime() > now.getTime()) {
        const minutes = Math.ceil((player.movingUntil.getTime() - now.getTime()) / 60_000);
        throw AppError.conflict('ON_THE_ROAD', `You are moving house: another ${minutes} minute${minutes === 1 ? '' : 's'} on the road. Nothing moves until you arrive.`);
      }

      // 0.5.0-A: Heat reads the player's own city.
      const ruleset = rulesetForCity(loadRulesetForRound(round), player.city.slug);
      // 0.6.0-B: settle corner upkeep/walkouts and pending house-minted tax before
      // an action reads cash, thugs, product or the home arsenal.
      const turfSettlement = await TurfService.settlePlayer(tx, roundPlayerId, ruleset, now);
      // 1.1.0-B: and business supply, income and any staff coming home from a lost block.
      const businessSettlement = await BusinessService.settlePlayer(tx, roundPlayerId, ruleset, now);
      // 1.6.0-H: lane loads that have landed are in storage before anything reads it.
      await SupplyLaneSettleService.settle(tx, roundPlayerId, ruleset, now);
      // 1.6.0-F: dealer sales first, so their takings can meet the upkeep after.
      const salesCash = await DealerSalesSettleService.settle(tx, roundPlayerId, ruleset, now);
      // 1.6.0-D: and property upkeep that has fallen due.
      const upkeepCash = await SupplyPropertySettleService.settleUpkeep(tx, roundPlayerId, ruleset, now);
      // 1.6.5-A: installments that have fallen due on the server clock, after the day's takings.
      const loanCash = await LoanSettleService.settle(tx, roundPlayerId, ruleset, now);
      // 1.3.0-C: and any warrant that is due is served before the action reads the player. A
      // personal warrant's lock-up takes hold from the next action.
      const warrantServed = await LawWarrantService.serveDue(tx, roundPlayerId, now);
      if (turfSettlement || businessSettlement || warrantServed || salesCash !== null || upkeepCash !== null || loanCash !== null) {
        player = await tx.roundPlayer.findUniqueOrThrow({
          where: { id: roundPlayerId },
          include: { city: true },
        });
      }
      const recovery = await CombatRecoveryService.settle(tx, roundPlayerId, now);

      // Turns first: an action always spends from a settled balance. The shop
      // shelves settle in the same breath, for the same reason.
      const turns = TurnService.settle(player, now, ruleset);
      const skills = await PlayerSkillService.effects(tx, roundPlayerId, ruleset.streetSkills);
      const standings = await ReputationService.load(tx, roundPlayerId, ruleset);
      // Standing shortens a shop's wait, so it has to be read before the
      // shelves settle - never the cap, only the interval.
      const stock = StockService.settle(player, now, ruleset, standings);
      const current: PlayerState = {
        ...toState(player),
        woundedThugs: recovery.woundedThugs,
        turns: turns.turns,
        // 0.4.0-C: Heat cools on the same clock turns regenerate on.
        heat: ruleset.heat ? coolHeat(player.heat, turns.intervalsProcessed, ruleset.heat, skills) : player.heat,
        ...stock.counts,
      };
      assertPlayerState(current, ruleset, 'before');
      const beforeProducts = await HappinessService.otherProducts(tx, roundPlayerId, ruleset);
      // Trips E: the girls notice the boss is gone, before and after the action alike.
      const awayPenalty = await HappinessService.awayPenalty(tx, ruleset, roundPlayerId, now);
      const beforeHappiness = HappinessService.recalculate({ ...current, thugs: fitThugs(current), products: beforeProducts }, ruleset, awayPenalty);
      const casinoNetWorthCents = await casinoCashEquivalentCents(tx, roundPlayerId, ruleset);
      const beforeNetWorth = NetWorthService.calculate({ ...current, products: beforeProducts, casinoNetWorthCents }, ruleset);
      const beforeRanks = await RankingService.ranksFor(tx, {
        id: roundPlayerId,
        roundId: player.roundId,
        cityId: player.cityId,
        netWorthCents: beforeNetWorth,
      });

      const outcome = await options.execute({
        tx,
        current,
        whoreHappiness: beforeHappiness.whoreHappiness,
        thugHappiness: beforeHappiness.thugHappiness,
        player,
        round,
        ruleset,
        now,
        stock,
        standings,
        recovery,
        netWorthCents: beforeNetWorth,
        skills,
      });
      // Fixer: whatever Heat the action added comes in smaller.
      const executed = consumeGeneratorFuel(
        withSkillHeat(current, outcome.next, skills),
        Math.max(0, current.turns - outcome.next.turns),
      );
      const fuelUsed = Math.max(0, (current.generatorFuel ?? 0) - (executed.generatorFuel ?? 0));
      if (fuelUsed > 0) await recordHideoutEconomy(tx, roundPlayerId, 'FUEL_USED', { quantity: fuelUsed, payload: { action: options.action, turns: Math.max(0, current.turns - outcome.next.turns) } });

      const trigger = encounterTriggerForAction(options.action);
      const actionEncounter = trigger ? await RandomEncounterService.action({
        tx,
        roundPlayerId,
        next: executed,
        ruleset,
        turns: Math.max(0, current.turns - executed.turns),
        now,
      }, trigger) : undefined;
      const staffing = await CrewStaffingOrderService.apply(tx, {
        roundPlayerId,
        ruleset,
        now,
        state: actionEncounter?.next ?? executed,
        player,
      });
      let next = staffing.next;
      // Scouting finds and workshop ingredients are written by their own services mid-action. Unless
      // the action handed back a new balance itself (a hideout build), re-read the stored one so the
      // whole-state write below does not put the old balance back, and net worth counts the new one.
      if (next.scavengedComponents === current.scavengedComponents) {
        const stored = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { scavengedComponents: true } });
        next = { ...next, scavengedComponents: stored.scavengedComponents as Prisma.InputJsonValue };
      }
      assertPlayerState(next, ruleset, 'after');
      assertLoanDebtChange(current.loanDebtCents, next.loanDebtCents, ruleset);

      const ledgerEntries = outcome.ledger
        ?? EconomyLedgerService.defaultForAction(options.action, current.cashCents, next.cashCents);
      if (ledgerEntries.length) {
        await EconomyLedgerService.record(tx, roundPlayerId, ledgerEntries, now);
      }

      if (outcome.reputation?.length) {
        await ReputationService.write(tx, roundPlayerId, withSkillStanding(outcome.reputation, standings, skills));
      }
      if (outcome.caseEvidence?.length && ruleset.law) {
        const key = options.actionId
          ? `action:${idempotencyAction}:${options.actionId}`
          : `action:${idempotencyAction}:${now.toISOString()}`;
        await LawService.record(tx, roundPlayerId, ruleset, outcome.caseEvidence.map((gain, index) => ({
          ...(gain.cityId || gain.citySlug ? {} : { cityId: player.cityId }),
          ...gain,
          sourceKey: `${key}:${index}`,
        })), now);
      }
      // The action may have moved product rows, so they are read again.
      const afterProducts = beforeProducts && (await HappinessService.otherProducts(tx, roundPlayerId, ruleset));
      // Re-read: the action may have sent the boss away (or brought them home).
      const afterHappiness = HappinessService.recalculate({ ...next, thugs: fitThugs(next), products: afterProducts }, ruleset, await HappinessService.awayPenalty(tx, ruleset, roundPlayerId, now));
      const afterNetWorth = NetWorthService.calculate({ ...next, products: afterProducts, casinoNetWorthCents }, ruleset);
      const afterRanks = await RankingService.ranksFor(tx, {
        id: roundPlayerId,
        roundId: player.roundId,
        cityId: player.cityId,
        netWorthCents: afterNetWorth,
      });

      const snapshotStale = RankingService.isDailySnapshotStale(player, now, ruleset);

      await tx.roundPlayer.update({
        where: { id: roundPlayerId },
        data: {
          ...next,
          ...stock.clocks,
          peakCrew: Math.max(player.peakCrew, next.whores + next.thugs),
          lastTurnCalculationAt: turns.lastTurnCalculationAt,
          lastActiveAt: now,
          ...(turns.awayBonus.awarded ? { lastAwayBonusAt: now } : {}),

          whoreHappiness: afterHappiness.whoreHappiness,
          thugHappiness: afterHappiness.thugHappiness,
          netWorthCents: afterNetWorth,

          localRank: afterRanks.localRank,
          nationalRank: afterRanks.nationalRank,
          ...(afterRanks.localRank !== player.localRank ? { localRankSinceAt: now } : {}),
          ...(afterRanks.nationalRank !== player.nationalRank ? { nationalRankSinceAt: now } : {}),
          ...(snapshotStale
            ? {
                dailyStartingLocalRank: beforeRanks.localRank,
                dailyStartingNationalRank: beforeRanks.nationalRank,
                dailyRankSnapshotAt: now,
              }
            : {}),
        },
      });

      // 1.7.0-A: the crew's members follow the counts the action just wrote.
      await CrewRosterService.sync(tx, roundPlayerId, ruleset, now, next);

      // Street Pass: turns spent on this action earn Cred, up to the daily cap.
      const turnsSpent = Math.max(0, current.turns - next.turns);
      if (turnsSpent > 0) {
        const experienceSourceKey = options.actionId
          ? `action:${options.action}:${options.actionId}`
          : `action:${options.action}:${roundPlayerId}:${now.toISOString()}`;
        await StreetPassCredService.creditTurns(tx, roundPlayerId, ruleset, turnsSpent, now, experienceSourceKey);
      }

      if (turns.awayBonus.awarded) {
        await ActivityService.log(tx, roundPlayerId, 'AWAY_BONUS', {
          turns: turns.awayBonus.amount,
          awayHours: ruleset.turns.awayBonus.afterHours,
        });
      }

      if (outcome.activity) {
        await ActivityService.log(
          tx,
          roundPlayerId,
          outcome.activity.type,
          actionEncounter?.encounter
            ? activityPayloadWithEncounter(outcome.activity.payload, actionEncounter.encounter)
            : outcome.activity.payload,
        );
      }
      const ammoThreshold = ruleset.ammoParts?.lowAmmoNotificationsEnabled ? typicalSquadAmmo(current, ruleset) : 0;
      const activityHasAmmoReceipt = outcome.activity?.payload && typeof outcome.activity.payload === 'object'
        && !Array.isArray(outcome.activity.payload) && 'ammoCombat' in outcome.activity.payload;
      if (!activityHasAmmoReceipt && ammoThreshold > 0 && (current.ammo ?? 0) > ammoThreshold && (next.ammo ?? 0) <= ammoThreshold) {
        await ActivityService.log(tx, roundPlayerId, 'AMMO_LOW', {
          ammoRemaining: next.ammo ?? 0,
          ammoThreshold,
          message: 'Your ammunition is running low. Restock before the next fight.',
        });
      }
      if (outcome.questProgress) {
        await QuestProgressService.emit(tx, roundPlayerId, {
          sourceKey: options.actionId
            ? `action:${options.action}:${options.actionId}`
            : `action:${options.action}:${roundPlayerId}:${now.toISOString()}`,
          type: outcome.questProgress.type,
          payload: outcome.questProgress.payload,
          at: now,
        });
      } else if (!outcome.activity) {
        // Not every resource-changing action belongs in the player's feed.
        // Quests still need one authoritative post-action signal so state
        // objectives and explicitly scoped action objectives never miss it.
        const cashChangeCents = Number(next.cashCents - current.cashCents);
        const turnsUsed = Math.max(0, current.turns - next.turns);
        await QuestProgressService.emit(tx, roundPlayerId, {
          sourceKey: options.actionId
            ? `action:${options.action}:${options.actionId}`
            : `action:${options.action}:${roundPlayerId}:${now.toISOString()}`,
          type: options.action,
          payload: {
            action: options.action,
            turns: turnsUsed,
            turnsUsed,
            cashCents: Math.max(0, cashChangeCents),
            cashChangeCents,
          },
          at: now,
        });
      }
      // A squad sent into a fight that resolves later is paid when it resolves, win or lose.
      const inferredSkill = ruleset.streetSkills && !outcome.skillXp?.length && streetSkillPaysAtLaunch(ruleset.streetSkills, options.action)
        ? streetSkillSourceForAction(ruleset.streetSkills, options.action)
        : null;
      const skillXp = outcome.skillXp?.length
        ? outcome.skillXp
        : inferredSkill
          ? [{ skill: inferredSkill.skill, amount: inferredSkill.baseXp }]
          : [];
      if (skillXp.length && ruleset.streetSkills) {
        await PlayerSkillService.awardMany(tx, {
          roundPlayerId,
          player,
          rules: ruleset.streetSkills,
          awards: skillXp,
          sourceKey: options.actionId ? `action:${options.action}:${options.actionId}` : `action:${options.action}:${roundPlayerId}:${now.toISOString()}`,
          now,
        });
      }

      const before = toSnapshot(current, beforeHappiness, beforeNetWorth);
      const after = toSnapshot(next, afterHappiness, afterNetWorth);

      const rankChanges: RankChanges = {
        localBefore: beforeRanks.localRank,
        localAfter: afterRanks.localRank,
        nationalBefore: beforeRanks.nationalRank,
        nationalAfter: afterRanks.nationalRank,
      };

      const result: GameActionResult<T> = {
        success: true,
        action: options.action,
        before,
        after,
        changes: diff(before, after),
        result: outcome.result,
        ...(skills.receipts().length ? { modifiers: skills.receipts() } : {}),
        ...(actionEncounter?.encounter ? { encounter: actionEncounter.encounter } : {}),
        ...(staffing.fills.length ? { staffingOrders: staffing.fills } : {}),
        rankChanges,
      };

      if (options.actionId) {
        await IdempotencyService.record(
          tx,
          options.actionId,
          roundPlayerId,
          idempotencyAction,
          result,
          now,
        );
      }

      return result;
    });
  },
};

/** An action's next state with any Heat it added reduced by the Fixer's heat-gain passive. */
export function withSkillHeat<S extends { heat: number }>(before: S, next: S, skills: SkillEffects): S {
  const added = next.heat - before.heat;
  if (added <= 0) return next;
  const pct = skills.percent('HEAT_GAIN');
  if (!pct) return next;
  return { ...next, heat: before.heat + Math.round(added * (100 + pct) / 100) };
}

/** Standing an action raised, raised a little further by the Regular perk. */
function withSkillStanding(changes: NonNullable<ActionOutcome<unknown>['reputation']>, standings: Standings, skills: SkillEffects): NonNullable<ActionOutcome<unknown>['reputation']> {
  return changes.map((change) => {
    const gained = change.points - (standings[change.trader]?.points ?? 0);
    if (gained <= 0) return change;
    const pct = skills.percent('STANDING_GAIN');
    return pct ? { ...change, points: change.points + Math.ceil(gained * pct / 100) } : change;
  });
}

function assertRoundPlayable(round: Round, now: Date): void {
  if (round.status !== 'ACTIVE' || round.endsAt.getTime() <= now.getTime()) {
    throw AppError.conflict('ROUND_ENDED', `${round.name} has ended.`);
  }
  assertNotPaused(round);
}

/** 1.0.0-E. A paused season refuses actions with its reason; nothing is lost while it waits. */
export function assertNotPaused(round: Pick<Round, 'name' | 'pausedAt' | 'pauseReason'>): void {
  if (round.pausedAt) {
    throw AppError.conflict('ROUND_PAUSED', `${round.name} is paused${round.pauseReason ? `: ${round.pauseReason}` : ''}. Your crew and everything on the road are safe; play resumes when the pause lifts.`);
  }
}

export type ActionDb = Db;
