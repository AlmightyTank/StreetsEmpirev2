import type { Ruleset } from '@streets/rulesets';
import { CRACK_PRODUCT, productEconomy } from './product-economy.js';

/** The Board A. Legal unit prices for one book value, in integer cents. */
export interface PlayerBoardBand {
  readonly bookCents: number;
  readonly floorCents: number;
  readonly capCents: number;
}

type BandRules = Pick<Ruleset, 'economy'> & Partial<Pick<Ruleset, 'playerBoard'>>;

/**
 * The price band for a good whose net worth is `bookCents` per unit.
 *
 * Rank counts cash at `cashWeightPercent` and the seller keeps `100 - taxPercent`, so:
 * - floor = book / weight, rounded up: the buyer's weighted cash loss covers the book they gain;
 * - cap = book / (weight × share), rounded down: the seller's weighted proceeds stay under the book they give up.
 *
 * Null when the ruleset has no Board block, the book is not a positive whole number of cents, or
 * the tax leaves no legal price. The band is priced whether or not the block is enabled.
 */
export function playerBoardBand(bookCents: number, ruleset: BandRules): PlayerBoardBand | null {
  const board = ruleset.playerBoard;
  if (!board || !Number.isSafeInteger(bookCents) || bookCents <= 0) return null;
  const weight = BigInt(ruleset.economy.netWorth.cashWeightPercent);
  const share = BigInt(100 - board.taxPercent);
  if (weight <= 0n || share <= 0n) return null;
  const book = BigInt(bookCents);
  const floor = (book * 100n + weight - 1n) / weight;
  const cap = (book * 10_000n) / (weight * share);
  if (floor > cap) return null;
  return { bookCents, floorCents: Number(floor), capCents: Number(cap) };
}

/** Whether `unitPriceCents` is a whole number of cents from the floor through the cap. */
export function isPlayerBoardPriceLegal(unitPriceCents: number, bookCents: number, ruleset: BandRules): boolean {
  const band = playerBoardBand(bookCents, ruleset);
  return band !== null && Number.isSafeInteger(unitPriceCents)
    && unitPriceCents >= band.floorCents && unitPriceCents <= band.capCents;
}

/**
 * What the seller is paid for a fill of `totalCents`. Rounded down, so the deleted tax never
 * falls below its share and the seller never keeps more than the cap assumes.
 */
export function playerBoardSellerProceedsCents(totalCents: number, ruleset: BandRules): number {
  const board = ruleset.playerBoard;
  if (!board) throw new Error('This ruleset has no player board.');
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error('A fill total must be whole, non-negative cents.');
  return Number((BigInt(totalCents) * BigInt(100 - board.taxPercent)) / 100n);
}

/** The Board B. A part's book in cents, or null when the ruleset gives it none and it cannot be listed. */
export function playerBoardPartBookCents(key: string, ruleset: BandRules): number | null {
  const books = ruleset.playerBoard?.partBookCents as Readonly<Record<string, number>> | undefined;
  if (!books || !Object.hasOwn(books, key)) return null;
  const book = books[key]!;
  return Number.isSafeInteger(book) && book > 0 ? book : null;
}

/**
 * The Board B. Held scavenge parts at book times quantity, only while the Board is enabled. Reads
 * the stored `scavengedComponents` JSON as is; unknown keys and non-positive or fractional
 * quantities count nothing.
 */
export function playerBoardPartsNetWorthCents(parts: unknown, ruleset: BandRules): bigint {
  if (!ruleset.playerBoard?.enabled || !parts || typeof parts !== 'object' || Array.isArray(parts)) return 0n;
  let total = 0n;
  for (const [key, quantity] of Object.entries(parts)) {
    const book = playerBoardPartBookCents(key, ruleset);
    if (book === null || !Number.isSafeInteger(quantity) || (quantity as number) <= 0) continue;
    total += BigInt(book) * BigInt(quantity as number);
  }
  return total;
}

/**
 * The Board C. The posting fee for a stack whose book value is `stackBookCents`: the ruleset's
 * percent of it, rounded up, and never under the minimum. Kept on cancel and expiry.
 */
export function playerBoardPostingFeeCents(stackBookCents: number, ruleset: BandRules): number {
  const board = ruleset.playerBoard;
  if (!board) throw new Error('This ruleset has no player board.');
  if (!Number.isSafeInteger(stackBookCents) || stackBookCents < 0) throw new Error('A stack book must be whole, non-negative cents.');
  const percent = BigInt(board.postingFeePercent);
  const fee = Number((BigInt(stackBookCents) * percent + 99n) / 100n);
  return Math.max(board.postingFeeMinCents, fee);
}

/**
 * The Board C. When an offer stops being open, after pushing its wall-clock expiry back by every
 * round pause since it was posted, including one still running. A paused round never eats a listing.
 */
export function playerBoardOfferExpiresAt(
  offer: { readonly expiresAt: Date; readonly pausedMinutesAtPost: number },
  round: { readonly pausedAt: Date | null; readonly pausedMinutesTotal: number },
  now: Date,
): Date {
  const completed = Math.max(0, round.pausedMinutesTotal - offer.pausedMinutesAtPost) * 60_000;
  const open = round.pausedAt ? Math.max(0, now.getTime() - round.pausedAt.getTime()) : 0;
  return new Date(offer.expiresAt.getTime() + completed + open);
}

/**
 * The Board. Cash a keeper must add to a trade, while the Board is on, so that what goes in is
 * worth at least the book of what comes out: rank counts cash at the cash weight, so a shortfall
 * of D cents needs D / weight of cash. Rounded up to whole dollars, which can only make it safer.
 * Zero when the trade already pays its way, or on rounds without the Board.
 */
export function playerBoardTradeTopUpCents(outputBookCents: number, inputBookCents: number, ruleset: BandRules): number {
  if (!ruleset.playerBoard?.enabled) return 0;
  const shortfall = BigInt(outputBookCents) - BigInt(inputBookCents);
  if (shortfall <= 0n) return 0;
  const weight = BigInt(ruleset.economy.netWorth.cashWeightPercent);
  const cents = (shortfall * 100n + weight - 1n) / weight;
  return Number(((cents + 99n) / 100n) * 100n);
}

/**
 * The Board F. A drug's book in cents, or null when it cannot be listed. The book is its net
 * worth value, and the drug is listable only while that equals Pip's buyback.
 */
export function playerBoardProductBookCents(key: string, ruleset: BandRules & Pick<Ruleset, 'stores'> & Partial<Pick<Ruleset, 'products'>>): number | null {
  if (!ruleset.playerBoard?.listableProducts?.includes(key)) return null;
  let book: number;
  let buyback: number | null;
  if (key === CRACK_PRODUCT) {
    book = ruleset.economy.netWorth.perCrackCents;
    buyback = ruleset.stores.PIP?.items.CRACK?.sellCents ?? null;
  } else {
    const economy = productEconomy(ruleset as Ruleset, key);
    if (!economy?.pip) return null;
    book = economy.netWorthCents;
    buyback = economy.pip.sellCents;
  }
  return Number.isSafeInteger(book) && book > 0 && book === buyback ? book : null;
}

/** The Board F. What a listable item is: a scavenge part, a drug, or nothing the Board takes. */
export function playerBoardItemKind(key: string, ruleset: Ruleset): 'PART' | 'PRODUCT' | null {
  if (playerBoardPartBookCents(key, ruleset) !== null) return 'PART';
  if (playerBoardProductBookCents(key, ruleset) !== null) return 'PRODUCT';
  return null;
}

/** The Board F. The book of any listable item, or null for anything the Board does not take. */
export function playerBoardItemBookCents(key: string, ruleset: Ruleset): number | null {
  return playerBoardPartBookCents(key, ruleset) ?? playerBoardProductBookCents(key, ruleset);
}

/**
 * The Board C-F. Escrowed stacks at their books, only while the Board is enabled. Parts and drugs
 * both count: an escrowed stack is still the seller's until it sells.
 */
export function playerBoardEscrowNetWorthCents(escrow: unknown, ruleset: Ruleset): bigint {
  if (!ruleset.playerBoard?.enabled || !escrow || typeof escrow !== 'object' || Array.isArray(escrow)) return 0n;
  let total = 0n;
  for (const [key, quantity] of Object.entries(escrow)) {
    const book = playerBoardItemBookCents(key, ruleset);
    if (book === null || !Number.isSafeInteger(quantity) || (quantity as number) <= 0) continue;
    total += BigInt(book) * BigInt(quantity as number);
  }
  return total;
}

export type PlayerBoardBarterRefusal = 'EMPTY' | 'TOO_MANY' | 'INVALID_QUANTITY' | 'NOT_LISTABLE' | 'SAME_ITEM' | 'ASKS_TOO_MUCH';

export interface PlayerBoardBarterQuote {
  /** Book of one lot of the item on offer. */
  lotBookCents: number;
  /** Book of the goods asked for one lot; never above `lotBookCents`. */
  askBookCents: number;
}

/**
 * The Board. Validate a barter: `ask` is what the buyer hands over for every `lotSize` units of
 * `offerKey` (1 by default, so the ask is per unit). The seller may not ask for more book than a
 * lot is worth, so no fill raises the seller's rank; the buyer's cash top-up for whatever they
 * take comes from `playerBoardBarterFeeCents`.
 */
export function playerBoardBarterQuote(
  offerKey: string,
  lotSize: number,
  ask: Readonly<Record<string, number>>,
  ruleset: Ruleset,
): PlayerBoardBarterQuote | { refusal: PlayerBoardBarterRefusal } {
  const entries = Object.entries(ask);
  if (entries.length === 0) return { refusal: 'EMPTY' };
  if (entries.length > (ruleset.playerBoard?.maxAskItems ?? 0)) return { refusal: 'TOO_MANY' };
  const unitBook = playerBoardItemBookCents(offerKey, ruleset);
  if (unitBook === null) return { refusal: 'NOT_LISTABLE' };
  if (!Number.isSafeInteger(lotSize) || lotSize < 1) return { refusal: 'INVALID_QUANTITY' };
  let askBook = 0;
  for (const [key, units] of entries) {
    if (key === offerKey) return { refusal: 'SAME_ITEM' };
    if (!Number.isSafeInteger(units) || units < 1) return { refusal: 'INVALID_QUANTITY' };
    const book = playerBoardItemBookCents(key, ruleset);
    if (book === null) return { refusal: 'NOT_LISTABLE' };
    askBook += book * units;
  }
  const lotBookCents = unitBook * lotSize;
  if (!Number.isSafeInteger(askBook) || askBook > lotBookCents) return { refusal: 'ASKS_TOO_MUCH' };
  return { lotBookCents, askBookCents: askBook };
}

/**
 * The Board. Cash a barter buyer adds for `lots` lots: the gap between the lots' book and the
 * goods handed over, at the cash weight, rounded up to whole dollars and deleted from the round,
 * so taking them cannot raise the buyer's rank. Priced on what this fill takes, never per lot.
 */
export function playerBoardBarterFeeCents(lotBookCents: number, askBookCents: number, lots: number, ruleset: Ruleset): number {
  return playerBoardTradeTopUpCents(lotBookCents * lots, askBookCents * lots, ruleset);
}
