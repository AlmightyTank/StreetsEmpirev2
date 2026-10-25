import type { Ruleset } from '@streets/rulesets';

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
