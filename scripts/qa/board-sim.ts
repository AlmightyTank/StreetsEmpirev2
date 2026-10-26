import { classicOgV26J, classicOgV26JBoard, DEFAULT_RULESET_ID, type Ruleset } from '@streets/rulesets';
import {
  calculateNetWorthCents,
  PLAYER_BOARD_KEEPER_GOODS,
  playerBoardBand,
  playerBoardBarterFeeCents,
  playerBoardBarterListingTaxCents,
  playerBoardBarterQuote,
  playerBoardCashBuyerFeeCents,
  playerBoardCashListingTaxCents,
  playerBoardItemBookCents,
  playerBoardItemKind,
  playerBoardPartBookCents,
  playerBoardPostingFeeCents,
  playerBoardSellerProceedsCents,
} from '@streets/rules-engine';
import { barterInputBookCents, salvagePrice } from '../../apps/server/src/services/salvage-yard.service.js';

/**
 * The Board H. A random-fill simulation over the live Board ruleset. Players post cash and barter
 * offers at any price (inside, above and below the fair range), buy any part of them, cancel and let
 * them expire, using the same pricing functions as the server. It fails if:
 *
 * - a fill, post, cancel or expiry creates or loses an item (every item across holdings and escrow
 *   is constant, and each seller's escrow equals their open offers);
 * - cash appears from nowhere (all cash plus everything the Board deleted is constant);
 * - any trade raises a rank, checked exactly per offer and per fill, and measured through
 *   `calculateNetWorthCents` for every player after every step;
 * - a legendary part costs more than the Board's floor for it on a Board round (the Salvage Yard's
 *   top-ups keep hideout builds within reach).
 *
 * Usage: npm run qa:board -- [steps] [seed]
 */

const steps = Number(process.argv[2] ?? 20_000);
const seed = Number(process.argv[3] ?? 20261225);
if (!Number.isSafeInteger(steps) || steps < 1 || steps > 2_000_000) throw new Error('Steps must be an integer from 1 to 2,000,000.');

const rules: Ruleset = classicOgV26JBoard;
const board = rules.playerBoard!;
const weight = BigInt(rules.economy.netWorth.cashWeightPercent);

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Board sim (seed ${seed}): ${message}`);
}

// mulberry32: small, seedable, reproducible.
let state = seed >>> 0;
function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(rows: readonly T[]): T => rows[Math.floor(random() * rows.length)]!;

// ---- Release pins -------------------------------------------------------------------------------

check(DEFAULT_RULESET_ID === classicOgV26JBoard.meta.id, `new rounds must pin ${classicOgV26JBoard.meta.id}; found ${DEFAULT_RULESET_ID}.`);
check(board.enabled === true, 'the default ruleset must have the Board on.');
check(classicOgV26J.playerBoard.enabled === false, 'the dark 2.6.0-J must keep the Board off for rounds pinned to it.');

// ---- Items --------------------------------------------------------------------------------------

const ITEMS = [
  'SCRAP_METAL', 'WIRING', 'RADIO', 'FUEL_CAN', 'MOTOR_ASSEMBLY', 'PRECISION_PARTS', 'SPECIALIST_CIRCUITRY',
  'CRACK', 'WEED', 'COCAINE', 'HEROIN',
  'PISTOL', 'SHOTGUN', 'AK47', 'LOW_RIDER', 'AMMO',
] as const;
type Item = (typeof ITEMS)[number];
const BOOK = Object.fromEntries(ITEMS.map((key) => {
  const book = playerBoardItemBookCents(key, rules);
  check(book !== null, `${key} must be listable on the live Board.`);
  return [key, book];
})) as Record<Item, number>;

// ---- Players ------------------------------------------------------------------------------------

type Player = { name: string; cashCents: bigint; held: Record<Item, number>; escrow: Partial<Record<Item, number>>; startWorth: bigint };

function netWorthInput(player: Player) {
  const parts: Record<string, number> = {};
  const products: Record<string, number> = {};
  const columns = { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0, lowRiders: 0, ammo: 0 };
  let crack = 0;
  for (const key of ITEMS) {
    const units = player.held[key];
    if (units <= 0) continue;
    const kind = playerBoardItemKind(key, rules);
    if (kind === 'PART') parts[key] = units;
    else if (kind === 'KEEPER') columns[PLAYER_BOARD_KEEPER_GOODS[key as keyof typeof PLAYER_BOARD_KEEPER_GOODS].field] += units;
    else if (key === 'CRACK') crack = units;
    else products[key] = units;
  }
  return {
    cashCents: player.cashCents, whores: 0, thugs: 0, medicine: 0, condoms: 0, beer: 0, crack, products,
    ...columns, scavengedComponents: parts, playerBoardEscrow: { ...player.escrow },
  };
}
const worth = (player: Player) => calculateNetWorthCents(netWorthInput(player), rules);

const players: Player[] = Array.from({ length: 8 }, (_, index) => {
  const held = Object.fromEntries(ITEMS.map((key) => [key, BOOK[key] >= 100_000 ? int(0, 2) : BOOK[key] >= 10_000 ? int(0, 8) : key === 'AMMO' ? int(0, 20_000) : int(0, 300)])) as Record<Item, number>;
  const player: Player = { name: `P${index + 1}`, cashCents: BigInt(int(20_000, 600_000) * 100), held, escrow: {}, startWorth: 0n };
  player.startWorth = worth(player);
  return player;
});

const totals = () => {
  const units = Object.fromEntries(ITEMS.map((key) => [key, players.reduce((sum, p) => sum + p.held[key] + (p.escrow[key] ?? 0), 0)])) as Record<Item, number>;
  return { units, cash: players.reduce((sum, p) => sum + p.cashCents, 0n) };
};
const start = totals();
let deletedCents = 0n;

// ---- Offers -------------------------------------------------------------------------------------

type Offer = {
  id: number; seller: Player; key: Item; remaining: number; kind: 'CASH' | 'BARTER'; unitPriceCents: number;
  lotSize: number; ask: Partial<Record<Item, number>>; askBookCents: number;
  /** Exact rank change this offer has caused its seller so far, in quarter cents (× 4 so 75% stays whole). */
  sellerQuarterCents: bigint;
};
const open: Offer[] = [];
let nextId = 1;
const stats = { posts: 0, cashPosts: 0, barterPosts: 0, overPosts: 0, underPosts: 0, fills: 0, partialFills: 0, cancels: 0, expiries: 0, refusals: 0 };

/** Exact rank value of `cents` in quarter cents at the cash weight. */
const weighted = (cents: bigint) => (cents * weight * 4n) / 100n;
const quarter = (cents: bigint) => cents * 4n;

function moveEscrow(offer: Offer, units: number) {
  const left = (offer.seller.escrow[offer.key] ?? 0) + units;
  if (left > 0) offer.seller.escrow[offer.key] = left;
  else delete offer.seller.escrow[offer.key];
}

function post(seller: Player): void {
  if (open.filter((offer) => offer.seller === seller).length >= board.maxOpenOffers) return;
  const choices = ITEMS.filter((key) => seller.held[key] > 0);
  if (!choices.length) return;
  const key = pick(choices);
  const book = BOOK[key];
  const barter = random() < 0.35;
  let quantity: number;
  let unitPriceCents = 0;
  let lotSize = 1;
  let ask: Partial<Record<Item, number>> = {};
  let askBookCents = 0;
  let taxCents: number;

  if (barter) {
    const wanted = ITEMS.filter((other) => other !== key);
    for (let i = 0, n = int(1, board.maxAskItems); i < n; i++) ask[pick(wanted)] = int(1, 3);
    const basket = Object.entries(ask).reduce((sum, [other, units]) => sum + BOOK[other as Item] * units!, 0);
    // Cheap goods trade in lots worth roughly the ask, sometimes more and sometimes less.
    lotSize = Math.max(1, Math.round((basket / book) * (0.5 + random())));
    const lots = Math.floor(seller.held[key] / lotSize);
    if (lots < 1) return;
    quantity = lotSize * int(1, Math.min(lots, 5));
    const quote = playerBoardBarterQuote(key, lotSize, ask as Record<string, number>, rules);
    if ('refusal' in quote) { stats.refusals++; return; }
    askBookCents = quote.askBookCents;
    taxCents = playerBoardBarterListingTaxCents(quote.lotBookCents, askBookCents, quantity / lotSize, rules);
  } else {
    quantity = int(1, seller.held[key]);
    const band = playerBoardBand(book, rules)!;
    const roll = random();
    unitPriceCents = roll < 0.6 ? int(band.floorCents, band.capCents) : roll < 0.8 ? Math.ceil(band.capCents * (1 + random())) : Math.max(1, Math.floor(band.floorCents * (0.3 + random() * 0.69)));
    if (unitPriceCents > band.capCents) stats.overPosts++;
    if (unitPriceCents < band.floorCents) stats.underPosts++;
    taxCents = playerBoardCashListingTaxCents(unitPriceCents, book, quantity, rules);
  }

  const feeCents = playerBoardPostingFeeCents(book * quantity, rules);
  const charged = BigInt(feeCents + taxCents);
  if (seller.cashCents < charged) { stats.refusals++; return; }

  const before = worth(seller);
  seller.cashCents -= charged;
  deletedCents += charged;
  seller.held[key] -= quantity;
  const offer: Offer = { id: nextId++, seller, key, remaining: quantity, kind: barter ? 'BARTER' : 'CASH', unitPriceCents, lotSize, ask, askBookCents, sellerQuarterCents: -weighted(charged) };
  moveEscrow(offer, quantity);
  open.push(offer);
  check(worth(seller) <= before, `posting offer ${offer.id} raised ${seller.name}'s rank.`);
  stats.posts++;
  if (barter) stats.barterPosts++; else stats.cashPosts++;
}

function fill(buyer: Player): void {
  const candidates = open.filter((offer) => offer.seller !== buyer);
  if (!candidates.length) return;
  const offer = pick(candidates);
  const book = BOOK[offer.key];
  const units = offer.kind === 'BARTER' ? offer.lotSize * int(1, offer.remaining / offer.lotSize) : int(1, offer.remaining);
  const lots = units / offer.lotSize;
  const sticker = offer.kind === 'CASH' ? offer.unitPriceCents * units : 0;
  const boardFee = offer.kind === 'CASH'
    ? playerBoardCashBuyerFeeCents(offer.unitPriceCents, book, units, rules)
    : playerBoardBarterFeeCents(book * offer.lotSize, offer.askBookCents, lots, rules);
  const paid = BigInt(sticker + boardFee);
  const given = Object.fromEntries(Object.entries(offer.ask).map(([key, perLot]) => [key, perLot! * lots])) as Partial<Record<Item, number>>;
  if (buyer.cashCents < paid || Object.entries(given).some(([key, units]) => buyer.held[key as Item] < units!)) { stats.refusals++; return; }

  const proceeds = BigInt(offer.kind === 'CASH' ? playerBoardSellerProceedsCents(sticker, rules) : 0);
  const buyerBefore = worth(buyer);
  const sellerBefore = worth(offer.seller);

  buyer.cashCents -= paid;
  offer.seller.cashCents += proceeds;
  deletedCents += paid - proceeds;
  for (const [key, units] of Object.entries(given) as Array<[Item, number]>) {
    buyer.held[key] -= units;
    offer.seller.held[key] += units;
  }
  buyer.held[offer.key] += units;
  moveEscrow(offer, -units);
  offer.remaining -= units;
  if (offer.remaining === 0) open.splice(open.indexOf(offer), 1);

  // Exact: what the buyer gave (cash at the weight, goods at book) is never worth less than what they got.
  const askBook = BigInt(offer.askBookCents * lots);
  const buyerExact = quarter(BigInt(book * units)) - weighted(paid) - quarter(askBook);
  check(buyerExact <= 0n, `buyer ${buyer.name} gained ${buyerExact} quarter cents on offer ${offer.id}.`);
  check(worth(buyer) <= buyerBefore, `filling offer ${offer.id} raised buyer ${buyer.name}'s rank.`);
  // Exact, from before posting: the seller's whole history with this offer never comes out ahead.
  offer.sellerQuarterCents += weighted(proceeds) + quarter(askBook) - quarter(BigInt(book * units));
  check(offer.sellerQuarterCents <= 0n, `seller ${offer.seller.name} is ${offer.sellerQuarterCents} quarter cents ahead on offer ${offer.id}.`);
  if (offer.kind === 'CASH' && offer.unitPriceCents <= playerBoardBand(book, rules)!.capCents) {
    check(worth(offer.seller) <= sellerBefore, `an in-range fill of offer ${offer.id} raised seller ${offer.seller.name}'s rank.`);
  }
  stats.fills++;
  if (offer.remaining > 0) stats.partialFills++;
}

function close(offer: Offer, kind: 'cancels' | 'expiries'): void {
  const before = worth(offer.seller);
  offer.seller.held[offer.key] += offer.remaining;
  moveEscrow(offer, -offer.remaining);
  open.splice(open.indexOf(offer), 1);
  check(worth(offer.seller) === before, `closing offer ${offer.id} moved ${offer.seller.name}'s rank.`);
  stats[kind]++;
}

function audit(step: number): void {
  const now = totals();
  for (const key of ITEMS) check(now.units[key] === start.units[key], `step ${step}: ${key} went from ${start.units[key]} to ${now.units[key]}.`);
  check(now.cash + deletedCents === start.cash, `step ${step}: cash plus deleted moved by ${now.cash + deletedCents - start.cash}.`);
  for (const player of players) {
    check(player.cashCents >= 0n, `step ${step}: ${player.name} went into debt.`);
    for (const key of ITEMS) check(player.held[key] >= 0, `step ${step}: ${player.name} holds ${player.held[key]} ${key}.`);
    for (const key of ITEMS) {
      const offered = open.filter((offer) => offer.seller === player && offer.key === key).reduce((sum, offer) => sum + offer.remaining, 0);
      check((player.escrow[key] ?? 0) === offered, `step ${step}: ${player.name}'s ${key} escrow is ${player.escrow[key] ?? 0}, offers hold ${offered}.`);
    }
    check(worth(player) <= player.startWorth, `step ${step}: ${player.name}'s rank rose above where they started.`);
  }
}

for (let step = 1; step <= steps; step++) {
  const roll = random();
  const actor = pick(players);
  if (roll < 0.4) post(actor);
  else if (roll < 0.85) fill(actor);
  else if (open.length) close(pick(open), roll < 0.93 ? 'cancels' : 'expiries');
  audit(step);
}

// ---- Hideout builds stay within reach -----------------------------------------------------------

const reach: string[] = [];
for (const key of ['HIGH_CAPACITY_FUEL_CELL', 'SPECIALIST_CIRCUITRY'] as const) {
  const price = salvagePrice(key, rules);
  const darkPrice = salvagePrice(key, classicOgV26J);
  check(price?.kind === 'BARTER' && darkPrice?.kind === 'BARTER', `${key} must stay a Salvage Yard barter.`);
  // Parts bought on the Board at their floor; store goods at their book over the cash weight.
  const partsFloor = Object.entries(price.components).reduce((sum, [part, units]) => sum + playerBoardBand(playerBoardPartBookCents(part, rules)!, rules)!.floorCents * units, 0);
  const partsBook = Object.entries(price.components).reduce((sum, [part, units]) => sum + playerBoardPartBookCents(part, rules)! * units, 0);
  const goodsCash = Math.ceil(((barterInputBookCents(price, rules) - partsBook) * 100) / Number(weight));
  const yard = partsFloor + goodsCash + price.cashCents;
  const floor = playerBoardBand(playerBoardPartBookCents(key, rules)!, rules)!.floorCents;
  // Whole-dollar top-ups and per-part floors round up a little; anything more is out of reach.
  check(yard <= floor + 500, `${key} costs $${(yard / 100).toFixed(2)} through the yard, over the Board floor of $${(floor / 100).toFixed(2)}.`);
  reach.push(`${key}: $${(yard / 100).toFixed(0)} through the yard (top-up $${(price.cashCents / 100).toFixed(0)}), Board floor $${(floor / 100).toFixed(0)}, dark round $${((partsFloor + goodsCash) / 100).toFixed(0)}.`);
}

console.log([
  `Board sim passed: ${steps.toLocaleString()} steps, seed ${seed}, ${players.length} players on ${rules.meta.id}.`,
  `Posts ${stats.posts} (cash ${stats.cashPosts}, barter ${stats.barterPosts}; ${stats.overPosts} over and ${stats.underPosts} under the fair range), fills ${stats.fills} (${stats.partialFills} partial), cancels ${stats.cancels}, expiries ${stats.expiries}, refused ${stats.refusals}.`,
  `Deleted by the Board: $${(Number(deletedCents) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}. Open offers left: ${open.length}.`,
  ...reach,
  'Verified: no item created or lost, escrow equals open offers, cash conserved with deletions, and no rank rose: exactly per offer and fill, and through calculateNetWorthCents for every player at every step.',
].join('\n'));
