import { randomInt } from 'node:crypto';
import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  horseRaceOrder,
  horseRaceOdds,
  casinoStatusTier,
  horseRacingRatingEdgeBps,
  horseReturnCents,
  loadRulesetForRound,
  scratchCardRatingEdgeBps,
  scratchPrizeMultiplier,
  type Rng,
  type Ruleset,
} from '@streets/rules-engine';
import type { CasinoRules } from '@streets/rulesets';
import type {
  CasinoHorseRaceBetInput,
  CasinoHorseRaceDto,
  CasinoHorseRaceStateDto,
  CasinoScratchCardDto,
  CasinoScratchCardPlayInput,
  CasinoScratchCardStateDto,
} from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { bossPresence } from './boss-presence.service.js';
import { CasinoStatusService } from './casino-status.service.js';
import { PlayerStateService } from './player-state.service.js';

type PlayerRow = RoundPlayer & { city: { id: string; slug: string; name: string }; round: { rulesetId: string; rulesetVersion: string } };
type SymbolDef = { key: string; label: string; glyph: string };

const secureRng: Rng = () => randomInt(0x1_0000_0000) / 0x1_0000_0000;
const SYMBOLS: readonly SymbolDef[] = [
  { key: 'CROWN', label: 'Crown', glyph: '♛' }, { key: 'DIAMOND', label: 'Diamond', glyph: '◆' },
  { key: 'SEVEN', label: 'Lucky Seven', glyph: '7' }, { key: 'BELL', label: 'Bell', glyph: '🔔' },
  { key: 'CHERRY', label: 'Cherry', glyph: '🍒' }, { key: 'STAR', label: 'Star', glyph: '★' },
  { key: 'HORSESHOE', label: 'Horseshoe', glyph: 'Ω' }, { key: 'KEY', label: 'Key', glyph: '⚿' },
  { key: 'MOON', label: 'Moon', glyph: '☾' }, { key: 'CLOVER', label: 'Clover', glyph: '♣' },
  { key: 'HEART', label: 'Heart', glyph: '♥' }, { key: 'SPADE', label: 'Spade', glyph: '♠' },
];

function requireCasino(ruleset: Ruleset): CasinoRules {
  if (!ruleset.casino?.enabled) throw AppError.conflict('CASINO_CLOSED', 'Casinos are not open in this round.');
  return ruleset.casino;
}

async function playerAndRules(db: Db | PrismaClient, roundPlayerId: string): Promise<{ player: PlayerRow; ruleset: Ruleset; casino: CasinoRules }> {
  const player = await db.roundPlayer.findUnique({ where: { id: roundPlayerId }, include: { city: true, round: true } });
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
  const ruleset = loadRulesetForRound(player.round);
  return { player, ruleset, casino: requireCasino(ruleset) };
}

async function currentCitySlug(db: Db | PrismaClient, ruleset: Ruleset, player: PlayerRow, now: Date): Promise<string | null> {
  const visiting = await bossPresence(db, ruleset, player.id, now);
  if (visiting) return visiting.city;
  if (player.movingUntil && player.movingUntil > now) return null;
  const [trip, run] = await Promise.all([
    db.bossTrip.count({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
    db.run.count({ where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true } }),
  ]);
  return trip + run > 0 ? null : player.city.slug;
}

async function requireSession(tx: Db, player: PlayerRow, ruleset: Ruleset, casino: CasinoRules, now: Date, game: string) {
  const slug = await currentCitySlug(tx, ruleset, player, now);
  if (!slug) throw AppError.conflict('NOT_AT_CASINO', `The boss has to be standing in a casino city to play ${game}.`);
  if (!casino.venues[slug]) throw AppError.conflict('NO_CASINO_HERE', 'There is no casino open where the boss is standing.');
  const city = await tx.city.findUnique({ where: { slug } });
  if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That casino city is not available.');
  const session = await tx.casinoSession.findFirst({ where: { roundPlayerId: player.id, status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
  if (!session) throw AppError.conflict('CASINO_SESSION_REQUIRED', `Open a casino bankroll before playing ${game}.`);
  if (session.cityId !== city.id) throw AppError.conflict('CASINO_SESSION_ELSEWHERE', 'Your open bankroll belongs to another casino. Close it before playing here.');
  return { city, session };
}

async function assertNoTableGame(tx: Db, roundPlayerId: string): Promise<void> {
  const [blackjack, poker, pokerSeat] = await Promise.all([
    tx.casinoBlackjackHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
    tx.casinoPokerHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
    tx.casinoPokerSeat.findFirst({ where: { roundPlayerId, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } }, select: { id: true } }),
  ]);
  if (blackjack) throw AppError.conflict('BLACKJACK_HAND_ACTIVE', 'Finish the current blackjack hand first.');
  if (poker) throw AppError.conflict('POKER_HAND_ACTIVE', 'Finish the current Poker hand first.');
  if (pokerSeat) throw AppError.conflict('POKER_TABLE_ACTIVE', 'Leave your multiplayer Poker table first.');
}

function scratchDto(entry: { actionId: string; sessionChipsAfterCents: bigint; createdAt: Date; metadata: Prisma.JsonValue }): CasinoScratchCardDto {
  const meta = entry.metadata as unknown as Omit<CasinoScratchCardDto, 'actionId' | 'bankrollAfterCents' | 'createdAt' | 'netCents'>;
  if (!meta || !Array.isArray(meta.winningSymbols) || !Array.isArray(meta.spots) || typeof meta.denominationCents !== 'number' || typeof meta.payoutCents !== 'number') {
    throw AppError.conflict('SCRATCH_CARD_RECEIPT_INVALID', 'That saved scratch card could not be replayed safely.');
  }
  return { ...meta, actionId: entry.actionId, netCents: meta.payoutCents - meta.denominationCents, bankrollAfterCents: Number(entry.sessionChipsAfterCents), createdAt: entry.createdAt.toISOString() };
}

function horseDto(entry: { actionId: string; sessionChipsAfterCents: bigint; createdAt: Date; metadata: Prisma.JsonValue }): CasinoHorseRaceDto {
  const meta = entry.metadata as unknown as Omit<CasinoHorseRaceDto, 'actionId' | 'bankrollAfterCents' | 'createdAt' | 'netCents'>;
  if (!meta || !Array.isArray(meta.finishOrder) || typeof meta.horseKey !== 'string' || typeof meta.wagerCents !== 'number' || typeof meta.returnCents !== 'number') {
    throw AppError.conflict('HORSE_RACE_RECEIPT_INVALID', 'That saved race ticket could not be replayed safely.');
  }
  return { ...meta, actionId: entry.actionId, netCents: meta.returnCents - meta.wagerCents, bankrollAfterCents: Number(entry.sessionChipsAfterCents), createdAt: entry.createdAt.toISOString() };
}

function shuffled<T>(values: readonly T[], rng: Rng): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.max(0, Math.min(0.999999999999, rng())) * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function buildScratchCard(denominationCents: number, multiplier: number, rng: Rng) {
  const winningSymbols = shuffled(SYMBOLS, rng).slice(0, 3);
  const losingSymbols = SYMBOLS.filter((symbol) => !winningSymbols.some((winner) => winner.key === symbol.key));
  const pieces = multiplier === 2 ? [1, 1] : multiplier === 10 ? [5, 5] : multiplier > 0 ? [multiplier] : [];
  const spots = pieces.map((piece, index) => {
    const symbol = winningSymbols[index % winningSymbols.length]!;
    return { symbolKey: symbol.key, label: symbol.label, glyph: symbol.glyph, prizeCents: denominationCents * piece, winning: true };
  });
  while (spots.length < 9) {
    const symbol = losingSymbols[Math.floor(Math.max(0, Math.min(0.999999999999, rng())) * losingSymbols.length)]!;
    const teaser = [1, 2, 5, 10, 25][Math.floor(Math.max(0, Math.min(0.999999999999, rng())) * 5)]!;
    spots.push({ symbolKey: symbol.key, label: symbol.label, glyph: symbol.glyph, prizeCents: denominationCents * teaser, winning: false });
  }
  return { winningSymbols, spots: shuffled(spots, rng), payoutCents: denominationCents * multiplier };
}

async function scratchState(db: Db | PrismaClient, roundPlayerId: string): Promise<CasinoScratchCardStateDto> {
  const { casino } = await playerAndRules(db, roundPlayerId);
  if (!casino.scratchCards) return { enabled: false, denominationsCents: [], rtpBps: 0, history: [] };
  const rows = await db.casinoLedgerEntry.findMany({ where: { roundPlayerId, kind: 'SCRATCH_CARD' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 12 });
  const totalWeight = casino.scratchCards.payoutTiers.reduce((sum, tier) => sum + tier.weight, 0);
  const rtpBps = Math.round(casino.scratchCards.payoutTiers.reduce((sum, tier) => sum + tier.multiplier * tier.weight, 0) * 10_000 / totalWeight);
  return { enabled: true, denominationsCents: [...casino.scratchCards.denominationsCents], rtpBps, history: rows.map(scratchDto) };
}

async function horseState(db: Db | PrismaClient, roundPlayerId: string): Promise<CasinoHorseRaceStateDto> {
  const { player, casino } = await playerAndRules(db, roundPlayerId);
  const rules = casino.horseRacing;
  if (!rules) return { enabled: false, minBetCents: 0, maxBetCents: 0, betStepCents: 0, horses: [], history: [] };
  const rows = await db.casinoLedgerEntry.findMany({ where: { roundPlayerId, kind: 'HORSE_RACE' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 12 });
  const marketRows = await db.casinoLedgerEntry.findMany({
    where: { cityId: player.cityId, kind: 'HORSE_RACE', roundPlayer: { roundId: player.roundId }, createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200,
    select: { metadata: true },
  });
  const volumeByHorse: Record<string, number> = {};
  const recentWinners: string[] = [];
  for (const row of marketRows) {
    const meta = row.metadata as Record<string, unknown>;
    if (typeof meta.horseKey === 'string' && typeof meta.wagerCents === 'number') volumeByHorse[meta.horseKey] = (volumeByHorse[meta.horseKey] ?? 0) + meta.wagerCents;
    if (typeof meta.winnerKey === 'string') recentWinners.push(meta.winnerKey);
  }
  const ratings = await db.casinoRating.findMany({ where: { roundPlayerId: player.id }, select: { theoBasis: true } });
  const theoCents = ratings.reduce((sum, rating) => sum + rating.theoBasis / 10_000n, 0n);
  const statusModifierBps = casino.status ? Math.min(500, casinoStatusTier(casino.status, theoCents).index * 100) : 0;
  const returns = horseRaceOdds(rules, { volumeByHorse, recentWinners, statusModifierBps });
  return {
    enabled: true, minBetCents: rules.minBetCents, maxBetCents: rules.maxBetCents, betStepCents: rules.betStepCents,
    horses: rules.horses.map((horse) => ({ ...horse, returnBps: returns[horse.key] ?? horse.returnBps, oddsLabel: `${Number(((returns[horse.key] ?? horse.returnBps) / 10_000 - 1).toFixed(1))}:1` })),
    history: rows.map(horseDto),
  };
}

export const CasinoInstantGamesService = {
  async scratchState(prisma: PrismaClient, roundPlayerId: string) { await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true }); return scratchState(prisma, roundPlayerId); },
  async horseState(prisma: PrismaClient, roundPlayerId: string) { await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true }); return horseState(prisma, roundPlayerId); },

  async playScratch(prisma: PrismaClient, roundPlayerId: string, input: CasinoScratchCardPlayInput, rng: Rng = secureRng): Promise<CasinoScratchCardDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const receipt = await tx.casinoLedgerEntry.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } } });
      if (receipt) {
        if (receipt.kind !== 'SCRATCH_CARD') throw AppError.conflict('ACTION_ID_REUSED', 'That action ID belongs to another casino action.');
        const saved = scratchDto(receipt);
        if (saved.denominationCents !== input.denominationCents) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID belongs to another scratch card.');
        return saved;
      }
      const { player, ruleset, casino } = await playerAndRules(tx, roundPlayerId);
      const rules = casino.scratchCards;
      if (!rules) throw AppError.conflict('SCRATCH_CARDS_CLOSED', 'Scratch cards are not open in this round.');
      if (!rules.denominationsCents.includes(input.denominationCents)) throw AppError.badRequest('SCRATCH_CARD_DENOMINATION', 'Pick one of the posted scratch-card prices.');
      const { city, session } = await requireSession(tx, player, ruleset, casino, now, 'Scratch Cards');
      await assertNoTableGame(tx, roundPlayerId);
      const wager = BigInt(input.denominationCents);
      if (session.bankrollCents < wager) throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips for that scratch card.');
      const card = buildScratchCard(input.denominationCents, scratchPrizeMultiplier(rules, rng), rng);
      const returned = BigInt(card.payoutCents);
      const bankrollAfter = session.bankrollCents - wager + returned;
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankrollAfter } });
      if (casino.status) {
        const play = { game: 'SCRATCH_CARDS' as const, tableKey: 'SCRATCH_CARDS', room: 'FLOOR' as const, actionId: input.actionId };
        await CasinoStatusService.rateWager(tx, ruleset, { roundPlayerId, cityId: city.id, wagerCents: wager, edgeBps: scratchCardRatingEdgeBps(casino.status), play, now });
        await CasinoStatusService.recordResult(tx, ruleset, { roundPlayerId, cityId: city.id, play, stakeCents: wager, returnCents: returned, highlight: card.payoutCents >= input.denominationCents * 25 ? 'BIG_WIN' : null, now });
      }
      const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } } });
      const ledger = await tx.casinoLedgerEntry.create({ data: { roundPlayerId, cityId: city.id, sessionId: session.id, actionId: input.actionId, kind: 'SCRATCH_CARD', sessionChipDeltaCents: returned - wager, walletChipsAfterCents: wallet?.chipsCents ?? 0n, sessionChipsAfterCents: bankrollAfter, metadata: { denominationCents: input.denominationCents, winningSymbols: card.winningSymbols, spots: card.spots, payoutCents: card.payoutCents } as Prisma.InputJsonValue } });
      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
      return scratchDto(ledger);
    });
  },

  async runHorseRace(prisma: PrismaClient, roundPlayerId: string, input: CasinoHorseRaceBetInput, rng: Rng = secureRng): Promise<CasinoHorseRaceDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const receipt = await tx.casinoLedgerEntry.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } } });
      if (receipt) {
        if (receipt.kind !== 'HORSE_RACE') throw AppError.conflict('ACTION_ID_REUSED', 'That action ID belongs to another casino action.');
        const saved = horseDto(receipt);
        if (saved.horseKey !== input.horseKey || saved.wagerCents !== input.wagerCents) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID belongs to another race ticket.');
        return saved;
      }
      const { player, ruleset, casino } = await playerAndRules(tx, roundPlayerId);
      const rules = casino.horseRacing;
      if (!rules) throw AppError.conflict('HORSE_RACING_CLOSED', 'Horse racing is not open in this round.');
      const horse = rules.horses.find((candidate) => candidate.key === input.horseKey);
      if (!horse) throw AppError.badRequest('HORSE_NOT_FOUND', 'Pick a horse from the posted field.');
      if (input.wagerCents < rules.minBetCents || input.wagerCents > rules.maxBetCents || input.wagerCents % rules.betStepCents !== 0) throw AppError.badRequest('HORSE_RACE_WAGER', 'Use the posted race-bet limits and chip increment.');
      const { city, session } = await requireSession(tx, player, ruleset, casino, now, 'Horse Racing');
      await assertNoTableGame(tx, roundPlayerId);
      const wager = BigInt(input.wagerCents);
      if (session.bankrollCents < wager) throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips for that race ticket.');
      const marketRows = await tx.casinoLedgerEntry.findMany({
        where: { cityId: city.id, kind: 'HORSE_RACE', roundPlayer: { roundId: player.roundId }, createdAt: { gte: new Date(now.getTime() - 6 * 60 * 60 * 1000) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200,
        select: { metadata: true },
      });
      const volumeByHorse: Record<string, number> = {};
      const recentWinners: string[] = [];
      for (const row of marketRows) {
        const meta = row.metadata as Record<string, unknown>;
        if (typeof meta.horseKey === 'string' && typeof meta.wagerCents === 'number') volumeByHorse[meta.horseKey] = (volumeByHorse[meta.horseKey] ?? 0) + meta.wagerCents;
        if (typeof meta.winnerKey === 'string') recentWinners.push(meta.winnerKey);
      }
      const ratings = await tx.casinoRating.findMany({ where: { roundPlayerId: player.id }, select: { theoBasis: true } });
      const theoCents = ratings.reduce((sum, rating) => sum + rating.theoBasis / 10_000n, 0n);
      const statusModifierBps = casino.status ? Math.min(500, casinoStatusTier(casino.status, theoCents).index * 100) : 0;
      const returns = horseRaceOdds(rules, { volumeByHorse, recentWinners, statusModifierBps });
      const finishOrder = horseRaceOrder(rules, rng, returns);
      const winner = rules.horses.find((candidate) => candidate.key === finishOrder[0])!;
      const returnBps = returns[horse.key] ?? horse.returnBps;
      const returned = horseReturnCents(wager, returnBps, winner.key === horse.key);
      const bankrollAfter = session.bankrollCents - wager + returned;
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankrollAfter } });
      if (casino.status) {
        const play = { game: 'HORSE_RACING' as const, tableKey: 'TRACK', room: 'FLOOR' as const, actionId: input.actionId };
        await CasinoStatusService.rateWager(tx, ruleset, { roundPlayerId, cityId: city.id, wagerCents: wager, edgeBps: horseRacingRatingEdgeBps(casino.status), play, now });
        await CasinoStatusService.recordResult(tx, ruleset, { roundPlayerId, cityId: city.id, play, stakeCents: wager, returnCents: returned, highlight: returned >= wager * 10n ? 'BIG_WIN' : null, now });
      }
      const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } } });
      const metadata = { horseKey: horse.key, horseName: horse.name, wagerCents: input.wagerCents, returnBps, finishOrder, winnerKey: winner.key, winnerName: winner.name, returnCents: Number(returned) };
      const ledger = await tx.casinoLedgerEntry.create({ data: { roundPlayerId, cityId: city.id, sessionId: session.id, actionId: input.actionId, kind: 'HORSE_RACE', sessionChipDeltaCents: returned - wager, walletChipsAfterCents: wallet?.chipsCents ?? 0n, sessionChipsAfterCents: bankrollAfter, metadata } });
      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
      return horseDto(ledger);
    });
  },
};
