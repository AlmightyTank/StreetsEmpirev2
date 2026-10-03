import { randomInt } from 'node:crypto';
import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  blackjackCanSplit,
  blackjackCardLabel,
  blackjackDealerShouldHit,
  blackjackHandOutcome,
  blackjackHandValue,
  blackjackRank,
  blackjackReturnCents,
  buildBlackjackShoe,
  loadRulesetForRound,
  type BlackjackCard,
  type Rng,
  type Ruleset,
} from '@streets/rules-engine';
import type { CasinoBlackjackTableRules, CasinoRules } from '@streets/rulesets';
import type {
  CasinoBlackjackActionInput,
  CasinoBlackjackDealInput,
  CasinoBlackjackHandDto,
  CasinoBlackjackPlayerHandDto,
  CasinoBlackjackStateDto,
} from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { bossPresence } from './boss-presence.service.js';
import { PlayerStateService } from './player-state.service.js';

type PlayerRow = RoundPlayer & {
  city: { id: string; slug: string; name: string };
  round: { rulesetId: string; rulesetVersion: string };
};

type StoredPlayerHand = {
  cards: BlackjackCard[];
  wagerCents: number;
  status: 'ACTIVE' | 'STOOD' | 'BUST' | 'DONE';
  fromSplit: boolean;
  splitAces: boolean;
  doubled: boolean;
  outcome: 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE' | 'BUST' | null;
  returnCents: number;
};

type ShoeState = {
  id: string;
  cards: BlackjackCard[];
  cursor: number;
  shuffleNumber: number;
};

const secureBlackjackRng: Rng = () => randomInt(0x1_0000_0000) / 0x1_0000_0000;

function requireCasino(ruleset: Ruleset): CasinoRules {
  const casino = ruleset.casino;
  if (!casino?.enabled) throw AppError.conflict('CASINO_CLOSED', 'Casinos are not open in this round.');
  return casino;
}

function requireBlackjack(ruleset: Ruleset): NonNullable<CasinoRules['blackjack']> {
  const casino = requireCasino(ruleset);
  if (!casino.blackjack) throw AppError.conflict('BLACKJACK_CLOSED', 'Blackjack is not open in this round.');
  return casino.blackjack;
}

function tableFor(ruleset: Ruleset, tableKey: string): CasinoBlackjackTableRules {
  const table = requireBlackjack(ruleset).tables.find((candidate) => candidate.key === tableKey);
  if (!table) throw AppError.notFound('BLACKJACK_TABLE_NOT_FOUND', 'That blackjack table is not part of this round.');
  return table;
}

function parseCards(value: Prisma.JsonValue): BlackjackCard[] {
  if (!Array.isArray(value) || !value.every((card) => typeof card === 'string')) {
    throw AppError.conflict('BLACKJACK_STATE_INVALID', 'The saved blackjack cards could not be read safely.');
  }
  return value as BlackjackCard[];
}

function parseHands(value: Prisma.JsonValue): StoredPlayerHand[] {
  if (!Array.isArray(value)) throw AppError.conflict('BLACKJACK_STATE_INVALID', 'The saved blackjack hand could not be read safely.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw AppError.conflict('BLACKJACK_STATE_INVALID', 'The saved blackjack hand could not be read safely.');
    }
    const hand = entry as Record<string, unknown>;
    if (
      !Array.isArray(hand.cards)
      || !hand.cards.every((card) => typeof card === 'string')
      || typeof hand.wagerCents !== 'number'
      || typeof hand.status !== 'string'
    ) {
      throw AppError.conflict('BLACKJACK_STATE_INVALID', 'The saved blackjack hand could not be read safely.');
    }
    return {
      cards: hand.cards as BlackjackCard[],
      wagerCents: hand.wagerCents,
      status: hand.status as StoredPlayerHand['status'],
      fromSplit: hand.fromSplit === true,
      splitAces: hand.splitAces === true,
      doubled: hand.doubled === true,
      outcome: (hand.outcome ?? null) as StoredPlayerHand['outcome'],
      returnCents: typeof hand.returnCents === 'number' ? hand.returnCents : 0,
    };
  });
}

function jsonHands(hands: StoredPlayerHand[]): Prisma.InputJsonValue {
  return hands.map((hand) => ({
    cards: [...hand.cards],
    wagerCents: hand.wagerCents,
    status: hand.status,
    fromSplit: hand.fromSplit,
    splitAces: hand.splitAces,
    doubled: hand.doubled,
    outcome: hand.outcome,
    returnCents: hand.returnCents,
  })) as Prisma.InputJsonValue;
}

function jsonCards(cards: BlackjackCard[]): Prisma.InputJsonValue {
  return [...cards] as Prisma.InputJsonValue;
}

async function playerAndRules(db: Db | PrismaClient, roundPlayerId: string): Promise<{ player: PlayerRow; ruleset: Ruleset; casino: CasinoRules }> {
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    include: { city: true, round: true },
  });
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
  const ruleset = loadRulesetForRound(player.round);
  return { player, ruleset, casino: requireCasino(ruleset) };
}

async function bossCitySlug(db: Db | PrismaClient, ruleset: Ruleset, player: PlayerRow, now: Date): Promise<string | null> {
  const visiting = await bossPresence(db, ruleset, player.id, now);
  if (visiting) return visiting.city;
  if (player.movingUntil && player.movingUntil > now) return null;
  const [tripOut, runOut] = await Promise.all([
    db.bossTrip.count({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
    db.run.count({ where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true } }),
  ]);
  return tripOut + runOut > 0 ? null : player.city.slug;
}

async function requireTableSession(
  tx: Db,
  player: PlayerRow,
  ruleset: Ruleset,
  casino: CasinoRules,
  table: CasinoBlackjackTableRules,
  now: Date,
) {
  const citySlug = await bossCitySlug(tx, ruleset, player, now);
  if (!citySlug) throw AppError.conflict('NOT_AT_CASINO', 'The boss has to be standing in a casino city to play Blackjack.');
  const venue = casino.venues[citySlug];
  if (!venue) throw AppError.conflict('NO_CASINO_HERE', 'There is no casino open where the boss is standing.');
  if (!table.venueKinds.includes(venue.kind)) {
    throw AppError.conflict('BLACKJACK_TABLE_NOT_HERE', 'That blackjack table is not available in this casino.');
  }
  const city = await tx.city.findUnique({ where: { slug: citySlug } });
  if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That casino city is not available.');
  const session = await tx.casinoSession.findFirst({
    where: { roundPlayerId: player.id, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
  if (!session) throw AppError.conflict('CASINO_SESSION_REQUIRED', 'Open a casino bankroll before playing Blackjack.');
  if (session.cityId !== city.id) {
    throw AppError.conflict('CASINO_SESSION_ELSEWHERE', 'Your open bankroll belongs to another casino. Close it before playing here.');
  }
  return { city, venue, session };
}

function assertWager(table: CasinoBlackjackTableRules, wagerCents: number): void {
  if (
    !Number.isSafeInteger(wagerCents)
    || wagerCents < table.minBetCents
    || wagerCents > table.maxBetCents
    || wagerCents % table.betStepCents !== 0
  ) {
    throw AppError.badRequest('BLACKJACK_WAGER', 'That bet is outside this table\'s posted limits.', {
      wagerCents: 'Use one of this table\'s posted wager increments.',
    });
  }
}

async function loadShoe(
  tx: Db,
  roundPlayerId: string,
  table: CasinoBlackjackTableRules,
  rng: Rng,
  reshuffleBetweenHands: boolean,
): Promise<ShoeState> {
  let row = await tx.casinoBlackjackShoe.findUnique({
    where: { roundPlayerId_tableKey: { roundPlayerId, tableKey: table.key } },
  });
  if (!row) {
    const cards = buildBlackjackShoe(table.decks, rng);
    row = await tx.casinoBlackjackShoe.create({
      data: { roundPlayerId, tableKey: table.key, cards: jsonCards(cards), cursor: 0, shuffleNumber: 1 },
    });
  }

  let cards = parseCards(row.cards);
  let cursor = row.cursor;
  let shuffleNumber = row.shuffleNumber;
  const remaining = cards.length - cursor;
  if (reshuffleBetweenHands && remaining <= table.reshuffleAtRemainingCards) {
    cards = buildBlackjackShoe(table.decks, rng);
    cursor = 0;
    shuffleNumber += 1;
  }
  return { id: row.id, cards, cursor, shuffleNumber };
}

function draw(shoe: ShoeState): BlackjackCard {
  const card = shoe.cards[shoe.cursor];
  if (!card) throw AppError.conflict('BLACKJACK_SHOE_EMPTY', 'The blackjack shoe ran out unexpectedly.');
  shoe.cursor += 1;
  return card;
}

async function saveShoe(tx: Db, shoe: ShoeState): Promise<void> {
  await tx.casinoBlackjackShoe.update({
    where: { id: shoe.id },
    data: {
      cards: jsonCards(shoe.cards),
      cursor: shoe.cursor,
      shuffleNumber: shoe.shuffleNumber,
    },
  });
}

function cardDto(card: BlackjackCard, hidden = false) {
  return hidden
    ? { code: null, label: 'Hidden card', hidden: true }
    : { code: card, label: blackjackCardLabel(card), hidden: false };
}

function handDto(
  row: {
    id: string;
    tableKey: string;
    status: string;
    playerHands: Prisma.JsonValue;
    dealerCards: Prisma.JsonValue;
    activeHandIndex: number;
    totalReturnCents: bigint;
    bankrollAfterCents: bigint;
    shoeRemainingCards: number;
    shuffleNumber: number;
    createdAt: Date;
    settledAt: Date | null;
  },
  table: CasinoBlackjackTableRules,
): CasinoBlackjackHandDto {
  const hands = parseHands(row.playerHands);
  const dealerCards = parseCards(row.dealerCards);
  const settled = row.status === 'SETTLED';
  const bankroll = Number(row.bankrollAfterCents);
  const playerHands: CasinoBlackjackPlayerHandDto[] = hands.map((hand, index) => {
    const value = blackjackHandValue(hand.cards);
    const active = !settled && index === row.activeHandIndex && hand.status === 'ACTIVE';
    const canFund = bankroll >= hand.wagerCents;
    return {
      index,
      cards: hand.cards.map((card) => cardDto(card)),
      total: value.total,
      soft: value.soft,
      status: settled ? 'DONE' : hand.status === 'DONE' ? 'DONE' : hand.status,
      wagerCents: hand.wagerCents,
      outcome: hand.outcome,
      returnCents: hand.returnCents,
      canHit: active,
      canStand: active,
      canDouble: active
        && hand.cards.length === 2
        && (!hand.fromSplit || table.allowDoubleAfterSplit)
        && !hand.splitAces
        && canFund,
      canSplit: active
        && hands.length < table.maxSplitHands
        && blackjackCanSplit(hand.cards)
        && canFund,
    };
  });
  const totalWagerCents = hands.reduce((sum, hand) => sum + hand.wagerCents, 0);
  const dealerValue = settled ? blackjackHandValue(dealerCards) : null;
  return {
    id: row.id,
    tableKey: table.key,
    tableName: table.name,
    status: settled ? 'SETTLED' : 'ACTIVE',
    dealerCards: dealerCards.map((card, index) => cardDto(card, !settled && index === 1)),
    dealerTotal: dealerValue?.total ?? null,
    dealerSoft: dealerValue?.soft ?? null,
    playerHands,
    activeHandIndex: row.activeHandIndex,
    totalWagerCents,
    totalReturnCents: Number(row.totalReturnCents),
    netCents: Number(row.totalReturnCents) - totalWagerCents,
    bankrollAfterCents: bankroll,
    shoeRemainingCards: row.shoeRemainingCards,
    shuffleNumber: row.shuffleNumber,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
  };
}

function firstActiveIndex(hands: StoredPlayerHand[], from = 0): number {
  for (let index = Math.max(0, from); index < hands.length; index++) {
    if (hands[index]!.status === 'ACTIVE') return index;
  }
  for (let index = 0; index < Math.max(0, from); index++) {
    if (hands[index]!.status === 'ACTIVE') return index;
  }
  return -1;
}

function markTwentyOnesStanding(hands: StoredPlayerHand[]): void {
  for (const hand of hands) {
    if (hand.status === 'ACTIVE' && blackjackHandValue(hand.cards).total === 21) hand.status = 'STOOD';
  }
}

function settleHands(
  hands: StoredPlayerHand[],
  dealerCards: BlackjackCard[],
  table: CasinoBlackjackTableRules,
  shoe: ShoeState,
): { totalReturnCents: bigint; dealerCards: BlackjackCard[] } {
  const live = hands.some((hand) => hand.status !== 'BUST' && !blackjackHandValue(hand.cards).bust);
  if (live) {
    while (blackjackDealerShouldHit(dealerCards, table.dealerHitsSoft17)) dealerCards.push(draw(shoe));
  }

  let totalReturnCents = 0n;
  for (const hand of hands) {
    const value = blackjackHandValue(hand.cards);
    const outcome = value.bust
      ? 'BUST'
      : blackjackHandOutcome(hand.cards, dealerCards, !hand.fromSplit);
    const returned = blackjackReturnCents(BigInt(hand.wagerCents), outcome, table);
    hand.status = 'DONE';
    hand.outcome = outcome;
    hand.returnCents = Number(returned);
    totalReturnCents += returned;
  }
  return { totalReturnCents, dealerCards };
}

async function walletAfter(tx: Db, roundPlayerId: string, cityId: string): Promise<bigint> {
  const wallet = await tx.casinoWallet.findUnique({
    where: { roundPlayerId_cityId: { roundPlayerId, cityId } },
  });
  return wallet?.chipsCents ?? 0n;
}

async function recordLedger(
  tx: Db,
  args: {
    roundPlayerId: string;
    cityId: string;
    sessionId: string;
    actionId: string;
    sessionDeltaCents: bigint;
    bankrollAfterCents: bigint;
    walletAfterCents: bigint;
    metadata: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.casinoLedgerEntry.create({
    data: {
      roundPlayerId: args.roundPlayerId,
      cityId: args.cityId,
      sessionId: args.sessionId,
      actionId: args.actionId,
      kind: 'BLACKJACK',
      sessionChipDeltaCents: args.sessionDeltaCents,
      walletChipsAfterCents: args.walletAfterCents,
      sessionChipsAfterCents: args.bankrollAfterCents,
      metadata: args.metadata,
    },
  });
}

function actionMetadata(
  action: string,
  table: CasinoBlackjackTableRules,
  hand: CasinoBlackjackHandDto,
  chargeCents: bigint,
  creditedCents: bigint,
): Prisma.InputJsonValue {
  return {
    game: 'BLACKJACK',
    action,
    handId: hand.id,
    tableKey: table.key,
    tableName: table.name,
    chargeCents: Number(chargeCents),
    creditedCents: Number(creditedCents),
    totalWagerCents: hand.totalWagerCents,
    totalReturnCents: hand.totalReturnCents,
    settled: hand.status === 'SETTLED',
    outcomes: hand.playerHands.map((playerHand) => playerHand.outcome),
  } as Prisma.InputJsonValue;
}

async function saveAction(
  tx: Db,
  roundPlayerId: string,
  handId: string,
  actionId: string,
  kind: string,
  response: CasinoBlackjackHandDto,
): Promise<void> {
  await tx.casinoBlackjackAction.create({
    data: {
      roundPlayerId,
      handId,
      actionId,
      kind,
      response: response as unknown as Prisma.InputJsonValue,
    },
  });
}

function replayDto(value: Prisma.JsonValue): CasinoBlackjackHandDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw AppError.conflict('BLACKJACK_RECEIPT_INVALID', 'That saved blackjack action could not be replayed safely.');
  }
  return value as unknown as CasinoBlackjackHandDto;
}

async function stateInDb(db: Db | PrismaClient, roundPlayerId: string, now: Date): Promise<CasinoBlackjackStateDto> {
  const { player, ruleset, casino } = await playerAndRules(db, roundPlayerId);
  if (!casino.blackjack) return { enabled: false, tables: [], activeHand: null, history: [] };

  const citySlug = await bossCitySlug(db, ruleset, player, now);
  const venue = citySlug ? casino.venues[citySlug] : undefined;
  const [active, history] = await Promise.all([
    db.casinoBlackjackHand.findFirst({
      where: { roundPlayerId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    }),
    db.casinoBlackjackHand.findMany({
      where: { roundPlayerId, status: 'SETTLED' },
      orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
      take: 20,
    }),
  ]);

  const tableMap = new Map(casino.blackjack.tables.map((table) => [table.key, table]));
  const dtoFor = (row: NonNullable<typeof active>) => {
    const table = tableMap.get(row.tableKey);
    if (!table) throw AppError.conflict('BLACKJACK_TABLE_MISSING', 'A saved blackjack hand references a table that no longer exists.');
    return handDto(row, table);
  };

  return {
    enabled: true,
    tables: casino.blackjack.tables.map((table) => ({
      key: table.key,
      name: table.name,
      blurb: table.blurb,
      minBetCents: table.minBetCents,
      maxBetCents: table.maxBetCents,
      betStepCents: table.betStepCents,
      decks: table.decks,
      dealerHitsSoft17: table.dealerHitsSoft17,
      blackjackPays: table.blackjackPayout.numerator + ':' + table.blackjackPayout.denominator,
      maxSplitHands: table.maxSplitHands,
      allowDoubleAfterSplit: table.allowDoubleAfterSplit,
      splitAcesOneCard: table.splitAcesOneCard,
      availableHere: Boolean(venue && table.venueKinds.includes(venue.kind)),
    })),
    activeHand: active ? dtoFor(active) : null,
    history: history.map((row) => dtoFor(row as NonNullable<typeof active>)),
  };
}

async function mutateActiveHand(
  prisma: PrismaClient,
  roundPlayerId: string,
  input: CasinoBlackjackActionInput,
  kind: 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT',
  rng: Rng,
): Promise<CasinoBlackjackHandDto> {
  await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await lockRoundPlayer(tx, roundPlayerId);

    const replay = await tx.casinoBlackjackAction.findUnique({
      where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
    });
    if (replay) {
      if (replay.kind !== kind || replay.handId !== input.handId) {
        throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different blackjack action.');
      }
      return replayDto(replay.response);
    }
    const casinoReceipt = await tx.casinoLedgerEntry.findUnique({
      where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
      select: { id: true },
    });
    if (casinoReceipt) {
      throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different casino action.');
    }

    const { ruleset } = await playerAndRules(tx, roundPlayerId);
    const row = await tx.casinoBlackjackHand.findUnique({ where: { id: input.handId } });
    if (!row || row.roundPlayerId !== roundPlayerId) {
      throw AppError.notFound('BLACKJACK_HAND_NOT_FOUND', 'That blackjack hand is not yours.');
    }
    if (row.status !== 'ACTIVE') throw AppError.conflict('BLACKJACK_HAND_SETTLED', 'That blackjack hand is already settled.');

    const table = tableFor(ruleset, row.tableKey);
    // A hand that was already dealt must never become stranded because the boss
    // traveled. New deals require physical casino presence; follow-up actions
    // stay attached to the exact open session/city where the hand began.
    const session = await tx.casinoSession.findUnique({ where: { id: row.sessionId } });
    if (
      !session
      || session.roundPlayerId !== roundPlayerId
      || session.status !== 'OPEN'
      || session.cityId !== row.cityId
    ) {
      throw AppError.conflict('BLACKJACK_SESSION_CHANGED', 'The casino bankroll that owns this blackjack hand is no longer open.');
    }

    const hands = parseHands(row.playerHands);
    let dealerCards = parseCards(row.dealerCards);
    const current = hands[row.activeHandIndex];
    if (!current || current.status !== 'ACTIVE') {
      throw AppError.conflict('BLACKJACK_NO_ACTIVE_HAND', 'There is no player hand waiting for that action.');
    }

    const shoe = await loadShoe(tx, roundPlayerId, table, rng, false);
    let chargeCents = 0n;

    if (kind === 'HIT') {
      if (current.splitAces && table.splitAcesOneCard) {
        throw AppError.conflict('BLACKJACK_SPLIT_ACES_LOCKED', 'Split aces receive one card each at this table.');
      }
      current.cards.push(draw(shoe));
      const value = blackjackHandValue(current.cards);
      if (value.bust) current.status = 'BUST';
      else if (value.total === 21) current.status = 'STOOD';
    } else if (kind === 'STAND') {
      current.status = 'STOOD';
    } else if (kind === 'DOUBLE') {
      if (
        current.cards.length !== 2
        || current.splitAces
        || (current.fromSplit && !table.allowDoubleAfterSplit)
      ) {
        throw AppError.conflict('BLACKJACK_DOUBLE_NOT_ALLOWED', 'This hand cannot be doubled.');
      }
      chargeCents = BigInt(current.wagerCents);
      if (session.bankrollCents < chargeCents) {
        throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips to double this hand.');
      }
      current.wagerCents *= 2;
      current.doubled = true;
      current.cards.push(draw(shoe));
      current.status = blackjackHandValue(current.cards).bust ? 'BUST' : 'STOOD';
    } else {
      if (!blackjackCanSplit(current.cards) || hands.length >= table.maxSplitHands) {
        throw AppError.conflict('BLACKJACK_SPLIT_NOT_ALLOWED', 'This hand cannot be split.');
      }
      chargeCents = BigInt(current.wagerCents);
      if (session.bankrollCents < chargeCents) {
        throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips to split this hand.');
      }
      const left = current.cards[0]!;
      const right = current.cards[1]!;
      const splitAces = blackjackRank(left) === 'A';
      const first: StoredPlayerHand = {
        cards: [left, draw(shoe)],
        wagerCents: current.wagerCents,
        status: 'ACTIVE',
        fromSplit: true,
        splitAces,
        doubled: false,
        outcome: null,
        returnCents: 0,
      };
      const second: StoredPlayerHand = {
        cards: [right, draw(shoe)],
        wagerCents: current.wagerCents,
        status: 'ACTIVE',
        fromSplit: true,
        splitAces,
        doubled: false,
        outcome: null,
        returnCents: 0,
      };
      hands.splice(row.activeHandIndex, 1, first, second);
      if (splitAces && table.splitAcesOneCard) {
        first.status = 'STOOD';
        second.status = 'STOOD';
      } else {
        markTwentyOnesStanding(hands);
      }
    }

    if (kind !== 'SPLIT') markTwentyOnesStanding(hands);
    const nextIndex = firstActiveIndex(hands, row.activeHandIndex);
    let totalReturnCents = row.totalReturnCents;
    let creditedCents = 0n;
    let settled = nextIndex < 0;
    let activeHandIndex = nextIndex < 0 ? Math.max(0, hands.length - 1) : nextIndex;

    if (settled) {
      const settlement = settleHands(hands, dealerCards, table, shoe);
      dealerCards = settlement.dealerCards;
      totalReturnCents = settlement.totalReturnCents;
      creditedCents = totalReturnCents;
    }

    const bankrollAfter = session.bankrollCents - chargeCents + creditedCents;
    if (chargeCents > 0n || creditedCents > 0n) {
      await tx.casinoSession.update({
        where: { id: session.id },
        data: { bankrollCents: bankrollAfter },
      });
    }

    await saveShoe(tx, shoe);
    const updated = await tx.casinoBlackjackHand.update({
      where: { id: row.id },
      data: {
        status: settled ? 'SETTLED' : 'ACTIVE',
        playerHands: jsonHands(hands),
        dealerCards: jsonCards(dealerCards),
        activeHandIndex,
        totalReturnCents,
        committedWagerCents: BigInt(hands.reduce((sum, hand) => sum + hand.wagerCents, 0)),
        bankrollAfterCents: bankrollAfter,
        shoeRemainingCards: shoe.cards.length - shoe.cursor,
        shuffleNumber: shoe.shuffleNumber,
        settledAt: settled ? now : null,
      },
    });

    const dto = handDto(updated, table);
    const wallet = await walletAfter(tx, roundPlayerId, row.cityId);
    if (chargeCents > 0n || settled) {
      await recordLedger(tx, {
        roundPlayerId,
        cityId: row.cityId,
        sessionId: session.id,
        actionId: input.actionId,
        sessionDeltaCents: creditedCents - chargeCents,
        bankrollAfterCents: bankrollAfter,
        walletAfterCents: wallet,
        metadata: actionMetadata(kind, table, dto, chargeCents, creditedCents),
      });
    }
    await saveAction(tx, roundPlayerId, row.id, input.actionId, kind, dto);
    await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
    return dto;
  });
}

export const BlackjackService = {
  async state(prisma: PrismaClient, roundPlayerId: string): Promise<CasinoBlackjackStateDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    return stateInDb(prisma, roundPlayerId, new Date());
  },

  async deal(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: CasinoBlackjackDealInput,
    rng: Rng = secureBlackjackRng,
  ): Promise<CasinoBlackjackHandDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);

      const replay = await tx.casinoBlackjackAction.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
      });
      if (replay) {
        if (replay.kind !== 'DEAL') {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another blackjack action.');
        }
        const saved = replayDto(replay.response);
        if (
          saved.tableKey !== input.tableKey
          || saved.playerHands[0]?.wagerCents !== input.wagerCents
        ) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different blackjack deal.');
        }
        return saved;
      }
      const casinoReceipt = await tx.casinoLedgerEntry.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
        select: { id: true },
      });
      if (casinoReceipt) {
        throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different casino action.');
      }

      const { player, ruleset, casino } = await playerAndRules(tx, roundPlayerId);
      const table = tableFor(ruleset, input.tableKey);
      assertWager(table, input.wagerCents);

      const [active, activeDice] = await Promise.all([
        tx.casinoBlackjackHand.findFirst({
          where: { roundPlayerId, status: 'ACTIVE' },
        }),
        tx.casinoStreetDiceRound.findFirst({
          where: { roundPlayerId, status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);
      if (active) throw AppError.conflict('BLACKJACK_HAND_ACTIVE', 'Finish the current blackjack hand before dealing another.');
      if (activeDice) throw AppError.conflict('STREET_DICE_ACTIVE', 'Finish the current Street Dice point before dealing blackjack.');

      const { city, session } = await requireTableSession(tx, player, ruleset, casino, table, now);
      const wager = BigInt(input.wagerCents);
      if (session.bankrollCents < wager) {
        throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips in the open bankroll for that blackjack bet.');
      }

      const shoe = await loadShoe(tx, roundPlayerId, table, rng, true);
      const hands: StoredPlayerHand[] = [{
        cards: [draw(shoe)],
        wagerCents: input.wagerCents,
        status: 'ACTIVE',
        fromSplit: false,
        splitAces: false,
        doubled: false,
        outcome: null,
        returnCents: 0,
      }];
      let dealerCards: BlackjackCard[] = [draw(shoe)];
      hands[0]!.cards.push(draw(shoe));
      dealerCards.push(draw(shoe));

      let totalReturnCents = 0n;
      let creditedCents = 0n;
      let settled = false;
      const openingPlayer = blackjackHandValue(hands[0]!.cards);
      const openingDealer = blackjackHandValue(dealerCards);
      if (openingPlayer.blackjack || openingDealer.blackjack) {
        const outcome = openingPlayer.blackjack
          ? openingDealer.blackjack ? 'PUSH' : 'BLACKJACK'
          : 'LOSE';
        const returned = blackjackReturnCents(wager, outcome, table);
        hands[0]!.status = 'DONE';
        hands[0]!.outcome = outcome;
        hands[0]!.returnCents = Number(returned);
        totalReturnCents = returned;
        creditedCents = returned;
        settled = true;
      }

      const bankrollAfter = session.bankrollCents - wager + creditedCents;
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankrollAfter } });
      await saveShoe(tx, shoe);

      const row = await tx.casinoBlackjackHand.create({
        data: {
          roundPlayerId,
          sessionId: session.id,
          cityId: city.id,
          tableKey: table.key,
          status: settled ? 'SETTLED' : 'ACTIVE',
          wagerCents: wager,
          committedWagerCents: wager,
          playerHands: jsonHands(hands),
          dealerCards: jsonCards(dealerCards),
          activeHandIndex: 0,
          totalReturnCents,
          bankrollAfterCents: bankrollAfter,
          shoeRemainingCards: shoe.cards.length - shoe.cursor,
          shuffleNumber: shoe.shuffleNumber,
          initialActionId: input.actionId,
          settledAt: settled ? now : null,
        },
      });
      const dto = handDto(row, table);
      const wallet = await walletAfter(tx, roundPlayerId, city.id);
      await recordLedger(tx, {
        roundPlayerId,
        cityId: city.id,
        sessionId: session.id,
        actionId: input.actionId,
        sessionDeltaCents: creditedCents - wager,
        bankrollAfterCents: bankrollAfter,
        walletAfterCents: wallet,
        metadata: actionMetadata('DEAL', table, dto, wager, creditedCents),
      });
      await saveAction(tx, roundPlayerId, row.id, input.actionId, 'DEAL', dto);
      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
      return dto;
    });
  },

  hit(prisma: PrismaClient, roundPlayerId: string, input: CasinoBlackjackActionInput, rng: Rng = secureBlackjackRng) {
    return mutateActiveHand(prisma, roundPlayerId, input, 'HIT', rng);
  },

  stand(prisma: PrismaClient, roundPlayerId: string, input: CasinoBlackjackActionInput, rng: Rng = secureBlackjackRng) {
    return mutateActiveHand(prisma, roundPlayerId, input, 'STAND', rng);
  },

  double(prisma: PrismaClient, roundPlayerId: string, input: CasinoBlackjackActionInput, rng: Rng = secureBlackjackRng) {
    return mutateActiveHand(prisma, roundPlayerId, input, 'DOUBLE', rng);
  },

  split(prisma: PrismaClient, roundPlayerId: string, input: CasinoBlackjackActionInput, rng: Rng = secureBlackjackRng) {
    return mutateActiveHand(prisma, roundPlayerId, input, 'SPLIT', rng);
  },
};
